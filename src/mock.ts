import {inspect} from "util"

type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends (infer U)[]
        ? DeepPartial<U>[]
        : T[P] extends readonly (infer U)[]
        ? readonly DeepPartial<U>[]
        : DeepPartial<T[P]>
}

const makeDeepHandler = <T extends object>(): ProxyHandler<T> => ({
    get: (target: T, key: PropertyKey) => {
        if (
            key === "asymmetricMatch" ||
            key === "constructor" ||
            key === "inspect" ||
            key === "nodeType" ||
            key === "toJSON" ||
            (typeof key === "string" && key.startsWith("@@__IMMUTABLE_")) ||
            key === "$$typeof" ||
            key === inspect.custom ||
            key === Symbol.toStringTag ||
            key === Symbol.iterator ||
            key === Symbol.asyncIterator
        ) {
            return undefined
        }

        if (!target.hasOwnProperty(key)) {
            throw new Error(
                `Tried to get property ${inspect(
                    key,
                )} on mocked object but this was not set on mocked object.`,
            )
        }

        const value = (target as any)[key]
        return typeof value === "object" && value !== null
            ? new Proxy<any>(value, makeDeepHandler<any>())
            : value
    },
})

export const mockObject = <T extends object>(o: DeepPartial<T>) =>
    new Proxy<T>(o as any, makeDeepHandler<T>())

export const mockFrom = <T extends object>(_: T, o: DeepPartial<T>) =>
    mockObject<T>(o)

const getOutermostMoudle = (m: NodeModule): NodeModule => {
    if (m.parent) {
        return getOutermostMoudle(m.parent)
    }
    return m
}

export const makeModuleMocker = (
    currentModule = getOutermostMoudle(module),
) => (modules: any) => {
    jest.resetModules()
    for (const [name, value] of Object.entries(modules)) {
        const moduleName = require.resolve(name, {paths: currentModule.paths})
        jest.doMock(moduleName, () => ({
            __esModule: {
                value: true,
            },
            ...jest.requireActual(moduleName),
            ...(typeof value === "function" ? value() : value),
        }))
    }
}

export const mockDate = async (
    date: number | string | Date,
    f: () => void | Promise<void>,
) => {
    const dateNowBackup = Date.now
    const time = new Date(date).getTime()

    try {
        Date.now = () => time
        await f()
    } finally {
        Date.now = dateNowBackup
    }
}
