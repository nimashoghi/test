import {toMatchSnapshot} from "jest-snapshot"
import {inspect} from "util"

type ArrayValueType<T> = T extends Array<infer U>
    ? U
    : T extends Readonly<infer U>
    ? U
    : never

type Primitive =
    | string
    | number
    | boolean
    | bigint
    | symbol
    | undefined
    | null
    | Date

type DeepPartialWithArray<T> = {
    [P in keyof T]?: T[P] extends Primitive
        ? any
        : (ArrayValueType<T[P]> extends never
              ? DeepPartialWithArray<T[P]>
              : DeepPartialWithArray<ArrayValueType<T[P]>>)
}

type DeepSnapshotInput<T> = ArrayValueType<T> extends never
    ? DeepPartialWithArray<T>
    : DeepPartialWithArray<ArrayValueType<T>>

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace jest {
        interface Matchers<R> {
            toMatchDeepSnapshot(
                propertyMatchers?: DeepSnapshotInput<R>,
                ignoreArrayOrder?: boolean,
                snapshotName?: string,
            ): R
        }
    }
}

const removeKeys = (obj: any, keys: string[]) =>
    Object.entries(obj)
        .filter(([key]) => !keys.includes(key))
        .reduce((acc, [key, value]) => ({...acc, [key]: value}), {})

function matchPropertiesAgainstObject(
    this: any,
    received: any,
    ignoreArrayOrder: boolean,
    propertyMatchers?: any,
    hint?: string,
): any {
    if (propertyMatchers === undefined) {
        return hint === undefined
            ? toMatchSnapshot.call(this, received)
            : toMatchSnapshot.call(this, received, hint)
    }

    if (Array.isArray(received)) {
        // if it's an empty array, get a snapshot anyways
        if (received.length === 0) {
            return toMatchSnapshot.call(this, received, hint)
        }

        let i = 0
        for (const element of ignoreArrayOrder ? received.sort() : received) {
            const arrayIndexText = `array index ${i++}`

            // Note: currently, this generates a new snapshot for every element of the array
            // TODO: in the future, we want to change this so it creates a single snapshot only
            const result = matchPropertiesAgainstObject.call(
                this,
                element,
                ignoreArrayOrder,
                propertyMatchers,
                hint ? `${hint} - ${arrayIndexText}` : arrayIndexText,
            )
            if (!result.pass) {
                return result
            }
        }

        return {
            message: () => `Expected ${received} not to match snapshot.`,
            pass: true,
        }
    } else if (typeof received === "object") {
        const receivedKeys = new Set(Object.keys(received))
        for (const key of Object.keys(propertyMatchers)) {
            if (!receivedKeys.has(key)) {
                throw new Error(
                    `Object ${inspect(
                        received,
                    )} does not have key "${key}" from propertyMatchers.`,
                )
            }
        }

        const arrayKeys = Object.entries(received)
            .filter(([, value]) => Array.isArray(value))
            .map(([key]) => key)
        const propertyMatchersArrayKeys = arrayKeys.filter(
            key => !!propertyMatchers[key],
        )

        const upperResult = toMatchSnapshot.call(
            this,
            removeKeys(received, propertyMatchersArrayKeys),
            removeKeys(propertyMatchers, propertyMatchersArrayKeys),
            hint,
        )
        if (!upperResult.pass) {
            return upperResult
        }

        for (const key of propertyMatchersArrayKeys) {
            const propertyKey = `property ${key}`
            const result = matchPropertiesAgainstObject.call(
                this,
                received[key],
                ignoreArrayOrder,
                propertyMatchers[key],
                hint ? `${hint} - ${propertyKey}` : propertyKey,
            )
            if (!result.pass) {
                return result
            }
        }

        return upperResult
    } else {
        return toMatchSnapshot.call(this, received, propertyMatchers, hint)
    }
}

const _expect = (globalThis as any).expect
_expect.extend({
    toMatchDeepSnapshot(
        received: any,
        propertyMatchers?: any,
        ignoreArrayOrder?: boolean,
        snapshotName?: string,
    ) {
        return matchPropertiesAgainstObject.call(
            this,
            received,
            ignoreArrayOrder || false,
            propertyMatchers,
            snapshotName,
        )
    },
})
