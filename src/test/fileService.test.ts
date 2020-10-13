import assert from 'assert';
import { describe, it } from 'mocha';
import { doComplete } from '../emmetHelper';
import { isAbsolutePath } from '../fileService';

describe('Check if a path is an absolute path', () => {
	function testIsAbsolutePath(path: string, expected: boolean) {
		it(`should ensure ${path} is ${expected ? '' : 'not'} an absolute path`, async () => {
			assert.strictEqual(isAbsolutePath(path), expected);
		})
	}

	testIsAbsolutePath('/home/test', true);
	testIsAbsolutePath('~/home/test', false);
	testIsAbsolutePath('./home/test', false);
	testIsAbsolutePath('../home/test', false);
	testIsAbsolutePath('C:/home/test', true);
	testIsAbsolutePath('/c:/home/test', true);
	testIsAbsolutePath('C:\\home\\test', true);
	testIsAbsolutePath('home/test', false);
})
