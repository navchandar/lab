
import {
    cp,
    mkdir,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const packages = [
    {
        name: "@ffmpeg/ffmpeg",
        version: "0.12.10",
        destination: "ffmpeg-0.12.10"
    },
    {
        name: "@ffmpeg/core",
        version: "0.12.6",
        destination: "core-0.12.6"
    },
    {
        name: "@ffmpeg/core-mt",
        version: "0.12.6",
        destination: "core-mt-0.12.6"
    }
];

async function main() {
    const vendorDirectory = path.join(ROOT, "vendor");

    await mkdir(vendorDirectory, { recursive: true });

    for (const item of packages) {
        const packageDirectory = path.join(
            ROOT,
            "node_modules",
            ...item.name.split("/")
        );

        const manifest = JSON.parse(
            await readFile(
                path.join(packageDirectory, "package.json"),
                "utf8"
            )
        );

        if (manifest.version !== item.version) {
            throw new Error(
                `${item.name}: expected ${item.version}, ` +
                `but found ${manifest.version}.`
            );
        }

        const source = path.join(packageDirectory, "dist", "esm");
        const destination = path.join(
            vendorDirectory,
            item.destination
        );

        // Remove stale files only from this generated package directory.
        await rm(destination, { recursive: true, force: true });

        await cp(source, destination, { recursive: true });

        console.log(
            `Copied ${item.name}@${item.version} → ` +
            `vendor/${item.destination}/`
        );
    }

    await writeFile(path.join(ROOT, ".nojekyll"), "");

    console.log("\nAssets are ready.");
    console.log("Serve index.html through localhost or HTTPS.");
}

main().catch((error) => {
    console.error("\nAsset setup failed:", error.message);
    process.exitCode = 1;
});