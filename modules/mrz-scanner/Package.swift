// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MRZScannerModule",
    platforms: [
        .iOS(.v15)
    ],
    products: [
        .library(
            name: "MRZScannerModule",
            targets: ["MRZScannerModule"]
        )
    ],
    dependencies: [],
    targets: [
        .target(
            name: "MRZScannerModule",
            dependencies: [
                .product(name: "ExpoModulesCore", package: "expo-modules-core")
            ],
            path: "ios"
        )
    ]
)
