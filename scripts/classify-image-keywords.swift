#!/usr/bin/env swift
import AppKit
import Foundation
import Vision

func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value),
          let text = String(data: data, encoding: .utf8) else { return }
    print(text)
    fflush(stdout)
}

while let path = readLine() {
    autoreleasepool {
        guard let image = NSImage(contentsOfFile: path),
              let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            emit(["path": path, "error": "image_not_readable"])
            return
        }
        let request = VNClassifyImageRequest()
        do {
            try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
            let labels = (request.results ?? [])
                .filter { $0.confidence >= 0.08 }
                .prefix(10)
                .map { ["label": $0.identifier, "confidence": Double($0.confidence)] as [String: Any] }
            emit(["path": path, "labels": labels])
        } catch {
            emit(["path": path, "error": error.localizedDescription])
        }
    }
}
