#!/usr/bin/env node

import {existsSync, promises as fs} from "fs"
import path from "path"

const matchAll = (str: string, regex: RegExp) => {
    let match: RegExpExecArray | null
    const matches: RegExpExecArray[] = []
    while ((match = regex.exec(str)) !== null) {
        matches.push(match)
    }
    return matches
}

const getJestTypesPath = (packageName = "@types/jest") => {
    const paths = require.resolve.paths(packageName)
    if (!paths) {
        throw new Error(`Could not resolve any paths for ${packageName}`)
    }

    const nodeModulesPath = paths.find(p => {
        const typesJestPath = path.join(p, "@types", "jest")
        return (
            existsSync(typesJestPath) &&
            existsSync(path.join(typesJestPath, "package.json"))
        )
    })
    if (nodeModulesPath === undefined) {
        throw new Error(
            `Failed to find package ${packageName}. Is it installed?`,
        )
    }

    return path.join(nodeModulesPath, "@types", "jest")
}

const main = async () => {
    const declarationPath = path.join(getJestTypesPath(), "index.d.ts")
    const content = (await fs.readFile(declarationPath)).toString()

    let updated = content
    for (const [match] of matchAll(content, /^(declare (?:var|const).+)$/gm)) {
        updated = updated.replace(`${match}\n`, "")
    }

    await fs.writeFile(declarationPath, updated)
    console.log(`Successfully patched jest/index.d.ts`)
}

main().catch(console.error)
