import fc from "fast-check"
import Spec from "jest-jasmine2/build/jasmine/Spec"
import {ItProp, ItPropOptions} from "./it-prop-types.generated"
export {Spec}

const hashCode = (str: string) => {
    let hash = 5381
    let i = str.length

    while (i) {
        hash = (hash * 33) ^ str.charCodeAt(--i)
    }

    /* JavaScript does bitwise operations (like XOR, above) on 32-bit signed
     * integers. Since we want the results to be always positive, convert the
     * signed int to an unsigned by doing an unsigned bitshift. */
    return hash >>> 0
}

interface AssertOptions {
    seed?: number
    numRuns?: number
}
const options = (spec: Spec, options: AssertOptions = {numRuns: 25}) => ({
    seed: hashCode(spec.getFullName()),
    ...options,
})

// TODO: Figure out where to put this
const INTEGRATION_TEST_NUM_RUNS = 5

type SpecCallback = (spec: Spec) => void

interface UpdatedEach {
    // Exclusively arrays.
    <T extends any[]>(cases: ReadonlyArray<T>): (
        name: string,
        fn: (args: T, spec: Spec) => any,
        timeout?: number,
    ) => Spec
}

interface UpdatedIt {
    (name: string, fn?: SpecCallback, timeout?: number): Spec
    only: UpdatedIt
    skip: UpdatedIt
    todo: UpdatedIt
    concurrent: UpdatedIt
    each: UpdatedEach
    prop: ItProp
}

interface SuiteResults {
    id: string
    description: string
    fullName: string
    testPath: string
    failedExpectations: []
}

interface Suite {
    id: string
    parentSuite?: Suite
    description: string
    throwOnExpectationFailure: boolean
    beforeFns: Function[]
    afterFns: Function[]
    beforeAllFns: Function[]
    afterAllFns: Function[]
    disabled: boolean
    children: Suite[]
    result: SuiteResults
    sharedContext?: any
    markedPending: boolean
    markedTodo: boolean
    isFocused: boolean
}

interface UpdatedDescribeEach {
    // Exclusively arrays.
    <T extends any[]>(cases: ReadonlyArray<T>): (
        name: string,
        fn: (args: T[], suite: Suite) => any,
        timeout?: number,
    ) => Suite
}

interface UpdatedDescribe {
    (
        name: number | string | Function | jest.FunctionLike,
        fn: jest.EmptyFunction,
    ): Suite
    /** Only runs the tests inside this `describe` for the current file */
    only: UpdatedDescribe
    /** Skips running the tests inside this `describe` for the current file */
    skip: UpdatedDescribe
    each: UpdatedDescribeEach
}

const isIntegrationTestModule = () => {
    const getOutermostMoudle = (m: NodeModule): NodeModule => {
        if (m.parent) {
            return getOutermostMoudle(m.parent)
        }
        return m
    }

    const {filename} = getOutermostMoudle(module)
    return filename.includes(".integration")
}

const patchDescribe = (describe_: jest.Describe): UpdatedDescribe => {
    const patch = <T extends Function>(d: T): T =>
        ((...args: any[]) => d(...args)) as any

    const patchEach = (f: jest.Each): UpdatedDescribeEach => <T extends any[]>(
        cases: ReadonlyArray<T>,
    ) => (
        name: string,
        fn: (args: T, suite: Suite) => any,
        timeout?: number,
    ) => {
        const suite = (f<T>(cases)(
            name,
            (...args: T) => fn(args, suite),
            timeout,
        ) as unknown) as Suite
        return suite
    }

    const ret: UpdatedDescribe = patch(describe_) as any
    ret.only = patch(describe_.only) as any
    ret.skip = patch(describe_.skip) as any
    ret.each = patchEach(describe_.each) as any
    return ret
}

const patchIt = (it_: jest.It): UpdatedIt => {
    const patch = (f: jest.It): UpdatedIt =>
        (((name: string, fn?: SpecCallback, timeout?: number) => {
            const spec = (f(
                name,
                fn ? () => fn(spec) : undefined,
                timeout,
            ) as unknown) as Spec
            return spec
        }) as unknown) as UpdatedIt

    const patchEach = (f: jest.Each): UpdatedEach => <T extends any[]>(
        cases: ReadonlyArray<T>,
    ) => (name: string, fn: (args: T, spec: Spec) => any, timeout?: number) => {
        const spec = (f<T>(cases)(
            name,
            (...args: T) => fn(args, spec),
            timeout,
        ) as unknown) as Spec
        return spec
    }

    const reorder = (f: Function) => (name: string, ...args: any[]) => {
        const last = args.pop()
        if (typeof last === "function") {
            // last == callback
            return f(name, args, last, {})
        } else {
            const callback = args.pop()
            if (typeof callback !== "function") {
                throw new Error("must be callback")
            }
            return f(name, args, callback, last)
        }
    }

    //TODO: what should the value of isolate be?
    const patchProp = (it_: jest.It) =>
        reorder(
            (
                name: string,
                arbitraries: fc.Arbitrary<any>[],
                callback: Function,
                {
                    integration = false,
                    isolate = true,
                    timeout: optionsTimeout,
                    ...assertOptions
                }: ItPropOptions = {},
            ) => {
                const isIntegration = integration || isIntegrationTestModule()
                const numRuns = isIntegration
                    ? INTEGRATION_TEST_NUM_RUNS
                    : undefined
                const timeout =
                    optionsTimeout || (isIntegration ? 50000 : undefined)

                const spec = (it_(
                    name,
                    async () =>
                        await fc.assert(
                            (fc.asyncProperty as any)(
                                ...arbitraries,
                                async (...args: any[]) => {
                                    if (isolate) {
                                        jest.resetModules()
                                    }
                                    return await callback(...args, spec)
                                },
                            ),
                            {
                                ...options(spec, {numRuns}),
                                timeout,
                                ...assertOptions,
                            },
                        ),
                    timeout,
                ) as unknown) as Spec
                return spec
            },
        )

    const ret = patch(it_)

    ret.concurrent = patch(it_.concurrent)
    ret.each = patchEach(it_.each)
    ret.only = patch(it_.only)
    ret.todo = it_.todo as any
    ret.skip = patch(it_.skip)
    ret.prop = patchProp(it_) as any
    return ret
}

export const it = patchIt((globalThis as any).it)
export const test = patchIt((globalThis as any).test)
export const describe = patchDescribe((globalThis as any).describe)
export const expect: jest.Expect = (globalThis as any).expect

export const beforeAll: jest.Lifecycle = (globalThis as any).beforeAll
export const beforeEach: jest.Lifecycle = (globalThis as any).beforeEach
export const afterAll: jest.Lifecycle = (globalThis as any).afterAll
export const afterEach: jest.Lifecycle = (globalThis as any).afterEach
