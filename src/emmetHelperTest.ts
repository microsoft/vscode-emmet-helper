import { TextDocument, Position } from 'vscode-languageserver-types'
import { isAbbreviationValid, extractAbbreviation, getExpandOptions, emmetSnippetField, updateExtensionsPath, doComplete } from './emmetHelper';
import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';

const extensionsPath = path.join(path.normalize(path.join(__dirname, '..')), 'testData');

describe('Validate Abbreviations', () => {
    it('should return true for valid abbreivations', () => {
        const htmlAbbreviations = ['ul>li', 'ul', 'h1', 'ul>li*3', '(ul>li)+div', '.hello', '!', '#hello', '.item[id=ok]'];
        htmlAbbreviations.forEach(abbr => {
            assert(isAbbreviationValid('html', abbr));
        });
        htmlAbbreviations.forEach(abbr => {
            assert(isAbbreviationValid('haml', abbr));
        });
    });
    it('should return false for invalid abbreivations', () => {
        const htmlAbbreviations = ['!ul!', '(hello)'];
        const cssAbbreviations = ['123'];
        htmlAbbreviations.forEach(abbr => {
            assert(!isAbbreviationValid('html', abbr));
        });
        htmlAbbreviations.forEach(abbr => {
            assert(!isAbbreviationValid('haml', abbr));
        });
        cssAbbreviations.forEach(abbr => {
            assert(!isAbbreviationValid('css', abbr));
        });
        cssAbbreviations.forEach(abbr => {
            assert(!isAbbreviationValid('scss', abbr));
        });
    })
});

describe('Extract Abbreviations', () => {
    it('should extract abbreviations', () => {
        const testCases: [string, number, number, string, number, number, number, number][] = [
            ['<div>ul>li*3</div>', 0, 7, 'ul', 0, 5, 0, 7],
            ['<div>ul>li*3</div>', 0, 10, 'ul>li', 0, 5, 0, 10],
            ['<div>ul>li*3</div>', 0, 12, 'ul>li*3', 0, 5, 0, 12],
            ['ul>li', 0, 5, 'ul>li', 0, 0, 0, 5]
        ]

        testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedRangeStartLine, expectedRangeStartChar, expectedRangeEndLine, expectedRangeEndChar]) => {
            const document = TextDocument.create('test://test/test.html', 'html', 0, content);
            const position = Position.create(positionLine, positionChar);
            const [abbrRange, abbr] = extractAbbreviation(document, position);

            assert.equal(expectedAbbr, abbr);
            assert.equal(expectedRangeStartLine, abbrRange.start.line);
            assert.equal(expectedRangeStartChar, abbrRange.start.character);
            assert.equal(expectedRangeEndLine, abbrRange.end.line);
            assert.equal(expectedRangeEndChar, abbrRange.end.character);
        });
    });
});

describe('Test Basic Expand Options', () => {
    it('should check for basic expand options', () => {
        const textToReplace = 'textToReplace';
        const syntax = 'anythingreally';
        let expandOptions = getExpandOptions({}, {}, syntax, textToReplace);

        assert.equal(expandOptions.field, emmetSnippetField)
        assert.equal(expandOptions.syntax, syntax);
        assert.equal(expandOptions.text, textToReplace)
    });
});

describe('Test output profile settings', () => {
    it('should convert output profile from old format to new', () => {
        const profile = {
            tag_case: 'lower',
            attr_case: 'lower',
            attr_quotes: 'single',
            tag_nl: true,
            inline_break: 2,
            self_closing_tag: 'xhtml'
        }

        const expandOptions = getExpandOptions({ html: profile }, {}, 'html');

        assert.equal(profile['tag_case'], expandOptions.profile['tagCase']);
        assert.equal(profile['attr_case'], expandOptions.profile['attributeCase']);
        assert.equal(profile['attr_quotes'], expandOptions.profile['attributeQuotes']);
        assert.equal(profile['tag_nl'], expandOptions.profile['format']);
        assert.equal(profile['inline_break'], expandOptions.profile['inlineBreak']);
        assert.equal(profile['self_closing_tag'], expandOptions.profile['selfClosingStyle']);
    });

    it('should convert self_closing_style', () => {
        const testCases = [true, false, 'xhtml'];
        const expectedValue = ['xml', 'html', 'xhtml'];

        for (let i = 0; i < testCases.length; i++) {
            const expandOptions = getExpandOptions({ html: { self_closing_tag: testCases[i] } }, {}, 'html');
            assert.equal(expandOptions.profile['selfClosingStyle'], expectedValue[i]);
        }
    });

    it('should convert tag_nl', () => {
        const testCases = [true, false, 'decide'];
        const expectedValue = [true, false, true];

        for (let i = 0; i < testCases.length; i++) {
            const expandOptions = getExpandOptions({ html: { tag_nl: testCases[i] } }, {}, 'html');
            assert.equal(expandOptions.profile['format'], expectedValue[i]);
        }
    });

    it('shoud use output profile in new format as is', () => {
        const profile = {
            tagCase: 'lower',
            attributeCase: 'lower',
            attributeQuotes: 'single',
            format: true,
            inlineBreak: 2,
            selfClosingStyle: 'xhtml'
        };

        const expandOptions = getExpandOptions({ html: profile }, {}, 'html');
        Object.keys(profile).forEach(key => {
            assert.equal(expandOptions.profile[key], profile[key]);
        });
    });

    it('should use profile from extensionsPath', () => {
        updateExtensionsPath(extensionsPath).then(() => {
            const profile = {
                tag_case: 'lower',
                attr_case: 'lower',
                attr_quotes: 'single',
                tag_nl: true,
                inline_break: 2,
                self_closing_tag: 'xhtml'
            }

            const expandOptions = getExpandOptions({ html: profile }, {}, 'html');
            assert.equal(expandOptions.profile['tagCase'], 'upper');
            assert.equal(profile['tag_case'], 'lower');
        });
    });
});

describe('Test variables settings', () => {
    it('should take in variables as is', () => {
        const variables = {
            lang: 'de',
            charset: 'UTF-8'
        }

        const expandOptions = getExpandOptions({}, variables, 'html');
        Object.keys(variables).forEach(key => {
            assert.equal(expandOptions.variables[key], variables[key]);
        });
    });

    it('should use variables from extensionsPath', () => {
        updateExtensionsPath(extensionsPath).then(() => {
            const variables = {
                lang: 'en',
                charset: 'UTF-8'
            }

            const expandOptions = getExpandOptions({}, variables, 'html');
            assert.equal(expandOptions.variables['lang'], 'fr');
            assert.equal(variables['lang'], 'en');
        });
    });
});

describe('Test custom snippets', () => {
    it('should use custom snippets from extensionsPath', () => {
        const customSnippetKey = 'ch';


        updateExtensionsPath(null).then(() => {
            const expandOptionsWithoutCustomSnippets = getExpandOptions({}, {}, 'css');
            assert(!expandOptionsWithoutCustomSnippets.snippets);

            // Use custom snippets from extensionsPath
            updateExtensionsPath(extensionsPath).then(() => {
                let foundCustomSnippet = false;
                let foundCustomSnippetInInhertitedSyntax = false;

                const expandOptionsWithCustomSnippets = getExpandOptions({}, {}, 'css');
                const expandOptionsWithCustomSnippetsInhertedSytnax = getExpandOptions({}, {}, 'scss');

                expandOptionsWithoutCustomSnippets.snippets.all({ type: 'string' }).forEach(snippet => {
                    if (snippet.key === customSnippetKey) {
                        foundCustomSnippet = true;
                    }
                });

                expandOptionsWithCustomSnippetsInhertedSytnax.snippets.all({ type: 'string' }).forEach(snippet => {
                    if (snippet.key === customSnippetKey) {
                        foundCustomSnippet = true;
                    }
                });

                assert.equal(foundCustomSnippet, true);
                assert.equal(foundCustomSnippetInInhertitedSyntax, true);
            });
        });
    });
});

describe('Test completions', () => {
    it('should provide completions', () => {
        updateExtensionsPath(null).then(() => {
            const testCases: [string, number, number, string, string, number, number, number, number][] = [
                ['<div>ul>li*3</div>', 0, 7, 'ul', '<ul></ul>', 0, 5, 0, 7],
                ['<div>ul>li*3</div>', 0, 10, 'ul>li', '<ul>\n\t<li></li>\n</ul>', 0, 5, 0, 10]
            ];

            testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedExpansion, expectedRangeStartLine, expectedRangeStartChar, expectedRangeEndLine, expectedRangeEndChar]) => {
                const document = TextDocument.create('test://test/test.html', 'html', 0, content);
                const position = Position.create(positionLine, positionChar);
                const completionList = doComplete(document, position, 'html', {
                    useNewEmmet: true,
                    showExpandedAbbreviation: 'always',
                    showAbbreviationSuggestions: false,
                    syntaxProfiles: {},
                    variables: {}
                });

                assert.equal(completionList.items[0].label, expectedAbbr);
                assert.equal(completionList.items[0].documentation, expectedExpansion);
            });

        });
    });

        it('should provide completions', () => {
        updateExtensionsPath(null).then(() => {
            const testCases: [string, number, number][] = [
                ['<div>abc</div>', 0, 8],
                ['<div>(div)</div>', 0, 10]
            ];

            testCases.forEach(([content, positionLine, positionChar]) => {
                const document = TextDocument.create('test://test/test.html', 'html', 0, content);
                const position = Position.create(positionLine, positionChar);
                const completionList = doComplete(document, position, 'html', {
                    useNewEmmet: true,
                    showExpandedAbbreviation: 'always',
                    showAbbreviationSuggestions: false,
                    syntaxProfiles: {},
                    variables: {}
                });

                assert.equal(completionList.items.length, 0);
            });

        });
    });

})