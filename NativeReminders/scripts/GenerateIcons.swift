import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let arguments = CommandLine.arguments
guard arguments.count == 3,
      let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: arguments[1]) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fatalError("Usage: GenerateIcons <source PNG> <output directory>")
}

let width = image.width
let height = image.height
let bytesPerRow = width * 4
let colorSpace = CGColorSpaceCreateDeviceRGB()
let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
var pixels = [UInt8](repeating: 0, count: bytesPerRow * height)
pixels.withUnsafeMutableBytes { buffer in
    guard let context = CGContext(data: buffer.baseAddress, width: width, height: height,
                                  bitsPerComponent: 8, bytesPerRow: bytesPerRow,
                                  space: colorSpace, bitmapInfo: bitmapInfo) else {
        fatalError("Cannot decode the source icon.")
    }
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
}

let outputDirectory = URL(fileURLWithPath: arguments[2], isDirectory: true)
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
for (name, invert) in [("Reminders", false), ("Installer", true)] {
    var transformed = pixels
    for row in 0..<height {
        for column in 0..<width {
            let sourceOffset = row * bytesPerRow + column * 4
            let targetOffset = row * bytesPerRow + (width - column - 1) * 4
            let alpha = pixels[sourceOffset + 3]
            for channel in 0..<3 {
                // Premultiplied colors invert relative to alpha, preserving transparent edges.
                transformed[targetOffset + channel] = invert ? alpha - pixels[sourceOffset + channel] : pixels[sourceOffset + channel]
            }
            transformed[targetOffset + 3] = alpha
        }
    }
    transformed.withUnsafeMutableBytes { buffer in
        guard let context = CGContext(data: buffer.baseAddress, width: width, height: height,
                                      bitsPerComponent: 8, bytesPerRow: bytesPerRow,
                                      space: colorSpace, bitmapInfo: bitmapInfo),
              let outputImage = context.makeImage(),
              let destination = CGImageDestinationCreateWithURL(
                outputDirectory.appendingPathComponent("\(name).png") as CFURL,
                UTType.png.identifier as CFString, 1, nil) else {
            fatalError("Cannot create the \(name) icon.")
        }
        CGImageDestinationAddImage(destination, outputImage, nil)
        guard CGImageDestinationFinalize(destination) else { fatalError("Cannot save the \(name) icon.") }
    }
}
