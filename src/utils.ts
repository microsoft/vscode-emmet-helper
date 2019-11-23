export const objectEntries =
    <K extends PropertyKey, V>(o: Record<K, V>) =>
        Object.keys(o).map(k => [k, o[k]] as [K, V])

export const objectFromEntries =
    <K extends PropertyKey, V extends any, E extends [K, V][]>(es: E) =>
        es.reduce((o, [k, v]) => {
            o[k] = v;
            return o;
        }, {} as Record<K, V>);

export const arrayFlatMap = <T, U>(
    arr: T[],
    mapper: (x: T, i: number, xs: T[]) => U[]
) =>
    arr
    .map(mapper)
    .reduce((f, a) => [...f, ...a], []);

export const isObject =
    (x: unknown): x is Record<PropertyKey, unknown> =>
        typeof x === 'object' && x !== null;

export const flattenObject = (options: Record<string, unknown>, depth: number = Infinity): Record<string, unknown> =>
    depth === 0 ? options : objectFromEntries(
        arrayFlatMap(
            objectEntries(options),
            ([key, value]) =>
                isObject(value)
                    ? [
                        ...objectEntries(flattenObject(value, depth - 1))
                        .map(([innerKey, innerValue]) =>
                            [key + '.' + innerKey, innerValue] as [string, unknown]
                        )
                    ] : [[key, value]]
        )
    );