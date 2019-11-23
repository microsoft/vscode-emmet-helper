import { describe, it } from 'mocha';
import { deepStrictEqual } from 'assert';
import { flattenObject } from '../utils';

describe('flattenObject', () => {
    it('works', () => {
        deepStrictEqual(
            flattenObject({ a: { c: 'x', p: { q: 'q' } }, d: true }, 1),
            { 'a.c': 'x', 'a.p': { q: 'q' }, d: true }
        )
    })
})