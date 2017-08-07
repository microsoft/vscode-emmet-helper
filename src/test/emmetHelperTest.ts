import { TextDocument, Position } from 'vscode-languageserver-types'
import { isAbbreviationValid, extractAbbreviation, extractAbbreviationFromText, getExpandOptions, emmetSnippetField, updateExtensionsPath, doComplete } from '../emmetHelper';
import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';

const extensionsPath = path.join(path.normalize(path.join(__dirname, '../..')), 'testData');

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
    it('should extract abbreviations from document', () => {
        const testCases: [string, number, number, string, number, number, number, number, string[]][] = [
            ['<div>ul>li*3</div>', 0, 7, 'ul', 0, 5, 0, 7, []],
            ['<div>ul>li*3</div>', 0, 10, 'ul>li', 0, 5, 0, 10, []],
            ['<div>ul>li*3</div>', 0, 12, 'ul>li*3', 0, 5, 0, 12, []],
            ['ul>li', 0, 5, 'ul>li', 0, 0, 0, 5, []],
            ['ul>li|bem', 0, 9, 'ul>li', 0, 0, 0, 9, ['bem']]
        ]

        testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedRangeStartLine, expectedRangeStartChar, expectedRangeEndLine, expectedRangeEndChar, expectedFilters]) => {
            const document = TextDocument.create('test://test/test.html', 'html', 0, content);
            const position = Position.create(positionLine, positionChar);
            const { abbreviationRange, abbreviation, filters } = extractAbbreviation(document, position);

            assert.equal(expectedAbbr, abbreviation);
            assert.equal(expectedRangeStartLine, abbreviationRange.start.line);
            assert.equal(expectedRangeStartChar, abbreviationRange.start.character);
            assert.equal(expectedRangeEndLine, abbreviationRange.end.line);
            assert.equal(expectedRangeEndChar, abbreviationRange.end.character);
            assert.equal(filters.length, expectedFilters.length);
            for (let i = 0; i < filters.length; i++) {
                assert.equal(filters[i], expectedFilters[i]);
            }
        });
    });

    it('should extract abbreviations from text', () => {
        const testCases: [string, string, string[]][] = [
            ['ul', 'ul', []],
            ['ul>li', 'ul>li', []],
            ['ul>li*3', 'ul>li*3', []],
            ['ul>li|bem', 'ul>li', ['bem']],
            ['ul>li|t', 'ul>li', ['t']]
        ]

        testCases.forEach(([content, expectedAbbr, expectedFilters]) => {
            const { abbreviation, filters } = extractAbbreviationFromText(content);

            assert.equal(expectedAbbr, abbreviation);
            assert.equal(filters.length, expectedFilters.length);
            for (let i = 0; i < filters.length; i++) {
                assert.equal(filters[i], expectedFilters[i]);
            }

        });
    });
});

describe('Test Basic Expand Options', () => {
    it('should check for basic expand options', () => {
        const textToReplace = 'textToReplace';
        const syntax = 'anythingreally';
        let expandOptions = getExpandOptions(syntax);

        assert.equal(expandOptions.field, emmetSnippetField)
        assert.equal(expandOptions.syntax, syntax);
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

        const expandOptions = getExpandOptions('html', { html: profile });

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
            const expandOptions = getExpandOptions('html', { html: { self_closing_tag: testCases[i] } });
            assert.equal(expandOptions.profile['selfClosingStyle'], expectedValue[i]);
        }
    });

    it('should convert tag_nl', () => {
        const testCases = [true, false, 'decide'];
        const expectedValue = [true, false, true];

        for (let i = 0; i < testCases.length; i++) {
            const expandOptions = getExpandOptions('html', { html: { tag_nl: testCases[i] } });
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

        const expandOptions = getExpandOptions('html', { html: profile });
        Object.keys(profile).forEach(key => {
            assert.equal(expandOptions.profile[key], profile[key]);
        });
    });

    it('should use profile from settings that overrides the ones from extensionsPath', () => {
        return updateExtensionsPath(extensionsPath).then(() => {
            const profile = {
                tag_case: 'lower',
                attr_case: 'lower',
                attr_quotes: 'single',
                tag_nl: true,
                inline_break: 2,
                self_closing_tag: 'xhtml'
            }

            const expandOptions = getExpandOptions('html', { html: profile });
            assert.equal(expandOptions.profile['tagCase'], 'lower');
            assert.equal(profile['tag_case'], 'lower');
            return Promise.resolve();
        });
    });
});

describe('Test variables settings', () => {
    it('should take in variables as is', () => {
        const variables = {
            lang: 'de',
            charset: 'UTF-8'
        }

        const expandOptions = getExpandOptions('html', {}, variables);
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

            const expandOptions = getExpandOptions('html', {}, variables);
            assert.equal(expandOptions.variables['lang'], 'fr');
            assert.equal(variables['lang'], 'en');
        });
    });
});

describe('Test custom snippets', () => {
    it('should use custom snippets from extensionsPath', () => {
        const customSnippetKey = 'ch';


        return updateExtensionsPath(null).then(() => {
            const expandOptionsWithoutCustomSnippets = getExpandOptions('css');
            assert(!expandOptionsWithoutCustomSnippets.snippets);

            // Use custom snippets from extensionsPath
            return updateExtensionsPath(extensionsPath).then(() => {
                let foundCustomSnippet = false;
                let foundCustomSnippetInInhertitedSyntax = false;

                const expandOptionsWithCustomSnippets = getExpandOptions('css');
                const expandOptionsWithCustomSnippetsInhertedSytnax = getExpandOptions('scss');

                expandOptionsWithCustomSnippets.snippets.all({ type: 'string' }).forEach(snippet => {
                    if (snippet.key === customSnippetKey) {
                        foundCustomSnippet = true;
                    }
                });

                expandOptionsWithCustomSnippetsInhertedSytnax.snippets.all({ type: 'string' }).forEach(snippet => {
                    if (snippet.key === customSnippetKey) {
                        foundCustomSnippetInInhertitedSyntax = true;
                    }
                });

                assert.equal(foundCustomSnippet, true);
                assert.equal(foundCustomSnippetInInhertitedSyntax, true);

                return Promise.resolve();
            });
        });
    });
});

describe('Test completions', () => {
    it('should provide completions', () => {
        return updateExtensionsPath(null).then(() => {
            const testCases: [string, number, number, string, string][] = [
                ['<div>ul>li*3</div>', 0, 7, 'ul', '<ul>|</ul>'],
                ['<div>ul>li*3</div>', 0, 10, 'ul>li', '<ul>\n\t<li>|</li>\n</ul>'],
                ['<div>(ul>li)*3</div>', 0, 14, '(ul>li)*3', '<ul>\n\t<li>|</li>\n</ul>\n<ul>\n\t<li>|</li>\n</ul>\n<ul>\n\t<li>|</li>\n</ul>']
            ];

            testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedExpansion]) => {
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
            return Promise.resolve();

        });
    });

    it('should provide completions using custom snippets', () => {
        return updateExtensionsPath(extensionsPath).then(() => {
            const testCases: [string, number, number, string, string][] = [
                ['<div>hey</div>', 0, 8, 'hey', '<ul>\n\t<li><span class="hello">|</span></li>\n\t<li><span class="hello">|</span></li>\n</ul>']
            ];

            testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedExpansion]) => {
                const document = TextDocument.create('test://test/test.html', 'html', 0, content);
                const position = Position.create(positionLine, positionChar);
                const completionList = doComplete(document, position, 'html', {
                    useNewEmmet: true,
                    showExpandedAbbreviation: 'always',
                    showAbbreviationSuggestions: false,
                    syntaxProfiles: {
                        'html': {
                            'tag_case': 'lower'
                        }
                    },
                    variables: {}
                });

                assert.equal(completionList.items[0].label, expectedAbbr);
                assert.equal(completionList.items[0].documentation, expectedExpansion);
            });
            return Promise.resolve();

        });
    });

    it('should not provide completions', () => {
        return updateExtensionsPath(null).then(() => {
            const testCases: [string, number, number][] = [
                ['<div>abc</div>', 0, 8],
                ['<div>abc12</div>', 0, 10],
                ['<div>abc.</div>', 0, 9],
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
            return Promise.resolve();

        });
    });

    it('should provide completions for lorem', () => {
        return updateExtensionsPath(null).then(() => {


            const document = TextDocument.create('test://test/test.html', 'html', 0, 'lorem10.item');
            const position = Position.create(0, 12);
            const completionList = doComplete(document, position, 'html', {
                useNewEmmet: true,
                showExpandedAbbreviation: 'always',
                showAbbreviationSuggestions: false,
                syntaxProfiles: {},
                variables: {}
            });
            const expandedText = completionList.items[0].documentation;
            let matches = expandedText.match(/<div class="item">(.*)<\/div>/);

            assert.equal(completionList.items[0].label, 'lorem10.item');
            assert.equal(matches != null, true);
            assert.equal(matches[1].split(' ').length, 10);
            assert.equal(matches[1].startsWith('Lorem'), true);

            return Promise.resolve();

        });
    });

})