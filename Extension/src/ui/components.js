// Small DOM factories for extension-owned UI.
// Uses var/function declarations so the file is safe in classic MV3 scripts.

(function initializeWebClassUxComponents(global) {
  var existing = global.WebClassUxComponents;
  if (existing && existing.version >= 1) return;

  function noop() {}

  function resolveDocument(candidate) {
    if (candidate && typeof candidate.createElement === "function") {
      return candidate;
    }
    if (typeof document !== "undefined") return document;
    return null;
  }

  function normalizeClassName(className) {
    if (Array.isArray(className)) {
      return className.filter(Boolean).join(" ");
    }
    return typeof className === "string" ? className.trim() : "";
  }

  function appendChildren(element, children, ownerDocument) {
    if (children === undefined || children === null) return;
    var list = Array.isArray(children) ? children : [children];
    list.forEach(function (child) {
      if (child === undefined || child === null) return;
      if (typeof child === "string" || typeof child === "number") {
        element.appendChild(ownerDocument.createTextNode(String(child)));
        return;
      }
      if (child && typeof child.nodeType === "number") {
        element.appendChild(child);
      }
    });
  }

  function createElement(tagName, options) {
    var config = options || {};
    var ownerDocument = resolveDocument(config.document);
    if (!ownerDocument) {
      throw new Error("A document is required to create extension UI.");
    }

    var safeTagName =
      typeof tagName === "string" && /^[a-z][a-z0-9-]*$/i.test(tagName)
        ? tagName
        : "div";
    var element = ownerDocument.createElement(safeTagName);
    var className = normalizeClassName(config.className);
    if (className) element.className = className;

    Object.keys(config.attributes || {}).forEach(function (name) {
      var value = config.attributes[name];
      if (value === undefined || value === null || value === false) return;
      element.setAttribute(name, value === true ? "" : String(value));
    });

    Object.keys(config.dataset || {}).forEach(function (name) {
      element.dataset[name] = String(config.dataset[name]);
    });

    if (config.text !== undefined && config.text !== null) {
      element.appendChild(ownerDocument.createTextNode(String(config.text)));
    } else {
      appendChildren(element, config.children, ownerDocument);
    }
    return element;
  }

  function addClassNames(baseClassName, extraClassName) {
    var names = [baseClassName];
    var normalized = normalizeClassName(extraClassName);
    if (normalized) names.push(normalized);
    return names.join(" ");
  }

  function setBooleanAttribute(element, name, value) {
    if (typeof value !== "boolean") return;
    element.setAttribute(name, value ? "true" : "false");
  }

  function createButton(options) {
    var config = options || {};
    var buttonType =
      config.type === "submit" || config.type === "reset"
        ? config.type
        : "button";
    var classNames = ["ux-button"];
    if (config.variant) classNames.push("ux-button--" + config.variant);
    if (config.size) classNames.push("ux-button--" + config.size);
    if (config.className) classNames.push(config.className);

    var button = createElement("button", {
      document: config.document,
      className: classNames,
      text: config.children ? undefined : config.label || "",
      children: config.children,
      attributes: { type: buttonType },
    });

    if (config.ariaLabel !== undefined) {
      button.setAttribute("aria-label", String(config.ariaLabel));
    }
    if (config.title !== undefined) {
      button.setAttribute("title", String(config.title));
    }
    setBooleanAttribute(button, "aria-pressed", config.ariaPressed);
    setBooleanAttribute(button, "aria-expanded", config.ariaExpanded);
    if (config.disabled) button.disabled = true;

    if (typeof config.onClick === "function") {
      var removeClickListener = bindEvent(button, "click", function (event) {
        if (
          button.disabled ||
          button.getAttribute("aria-disabled") === "true"
        ) {
          event.preventDefault();
          return;
        }
        config.onClick(event, button);
      });
      if (config.cleanup && typeof config.cleanup.add === "function") {
        config.cleanup.add(removeClickListener);
      }
    }
    return button;
  }

  function createIconButton(options) {
    var config = options || {};
    var label = config.ariaLabel || config.label || config.title || "Action";
    var iconOptions = {};
    Object.keys(config).forEach(function (key) {
      iconOptions[key] = config[key];
    });
    iconOptions.className = addClassNames(
      "ux-icon-button",
      config.className,
    );
    iconOptions.ariaLabel = label;
    iconOptions.label = "";
    return createButton(iconOptions);
  }

  function bindEvent(target, eventName, listener, options) {
    if (!target || typeof target.addEventListener !== "function") {
      return noop;
    }
    target.addEventListener(eventName, listener, options);
    return function removeEventListener() {
      target.removeEventListener(eventName, listener, options);
    };
  }

  function createCleanup() {
    var cleanups = [];
    var finished = false;

    return {
      add: function addCleanup(cleanup) {
        if (typeof cleanup !== "function") return cleanup;
        if (finished) {
          cleanup();
          return cleanup;
        }
        cleanups.push(cleanup);
        return cleanup;
      },
      listen: function listen(target, eventName, listener, options) {
        return this.add(bindEvent(target, eventName, listener, options));
      },
      run: function runCleanup() {
        if (finished) return;
        finished = true;
        cleanups.splice(0).reverse().forEach(function (cleanup) {
          try {
            cleanup();
          } catch (error) {
            // Cleanup should not prevent the remaining handlers from being removed.
            if (global.uxDebugModeState && global.uxDebugModeState.enabled) {
              console.warn("WebClass UI cleanup failed", error);
            }
          }
        });
      },
    };
  }

  function sourceIsDisabled(source) {
    return Boolean(
      source &&
        (source.disabled ||
          (typeof source.getAttribute === "function" &&
            source.getAttribute("aria-disabled") === "true")),
    );
  }

  function createProxyButton(options) {
    var config = options || {};
    var source = config.source;
    if (!source || typeof source.click !== "function") {
      throw new TypeError("createProxyButton requires a clickable source element.");
    }

    var cleanup = createCleanup();
    var button = createButton({
      document: config.document || source.ownerDocument,
      label: config.label || (source.textContent || "").trim() || "Action",
      ariaLabel: config.ariaLabel,
      title: config.title,
      variant: config.variant,
      size: config.size,
      className: config.className,
    });

    function sync() {
      var disabled = sourceIsDisabled(source);
      button.disabled = disabled;
      if (disabled) {
        button.setAttribute("aria-disabled", "true");
      } else {
        button.removeAttribute("aria-disabled");
      }
    }

    cleanup.listen(button, "click", function (event) {
      if (sourceIsDisabled(source)) {
        event.preventDefault();
        sync();
        return;
      }
      source.click();
    });
    sync();

    if (config.cleanup && typeof config.cleanup.add === "function") {
      config.cleanup.add(cleanup.run);
    }
    return {
      button: button,
      sync: sync,
      cleanup: cleanup.run,
    };
  }

  global.WebClassUxComponents = {
    version: 1,
    createElement: createElement,
    createButton: createButton,
    createIconButton: createIconButton,
    createProxyButton: createProxyButton,
    bindEvent: bindEvent,
    createCleanup: createCleanup,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
