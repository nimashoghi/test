import fc from "fast-check"

export const alphanumeric = () =>
    fc.char().filter(str => {
        const c = str.charCodeAt(0)

        if (c >= 0x30 /* 0 */ && c <= 0x30 /* 9 */) {
            // digit
            return true
        } else if (c >= 0x41 /* A */ && c <= 0x5a /* Z */) {
            // uppercase char
            return true
        } else if (c >= 0x61 /* a */ && c <= 0x7a /* z */) {
            // lowercase char
            return true
        }
        return false
    })

export const alphanumericString = ({
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
}: {
    min?: number
    max?: number
} = {}) => fc.stringOf(alphanumeric(), min, max)

export const date = (
    min = new Date("1970-01-01Z00:00:00:000"),
    max = new Date("2100-01-01Z00:00:00:000"),
) => fc.date({min, max})

export const phoneNumber = () =>
    fc
        .array(fc.integer(0, 9), 10, 10)
        .map(ints => ints.map(i => i.toString()).join(""))
