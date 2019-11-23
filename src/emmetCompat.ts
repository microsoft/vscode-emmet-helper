import expand, { parseMarkup, parseStylesheet, resolveConfig, Config, extract } from 'emmet';
import { flattenObject } from './utils';
import { HelperExpandOptions } from './emmetHelper';

const stylesheetSyntaxes = ['css', 'sass', 'scss', 'less', 'stylus'];

export const toConfig = (helperOptions: HelperExpandOptions): Config => {

    let config = resolveConfig({
        type: stylesheetSyntaxes.includes(helperOptions.syntax)
            ? 'stylesheet'
            : 'markup',
        syntax: helperOptions.syntax,
        snippets: helperOptions.snippets,
        variables: helperOptions.variables
    }); 
    
    helperOptions.preferences = helperOptions.preferences || {};
    for (let key in helperOptions) {
        if (stylesheetSyntaxes.some(s => key.startsWith(s))) {
            helperOptions.preferences['stylesheet' + key.replace(/^[a-z]/g, '')] = helperOptions.preferences[key];
            delete helperOptions[key]; 
        }
    }

    for (let key in helperOptions.addons) {
        if (typeof helperOptions.addons[key] === 'boolean') {
            helperOptions.addons[key] = { enabled: true };
        } else {
            helperOptions.addons[key].enabled = true;
        }
    }

    config.options = {
        ...config.options,
        ...flattenObject(helperOptions.preferences, 1),
        ...flattenObject(helperOptions.format, 1),
        ...flattenObject(helperOptions.addons, 1),
        'output.field':
            (index: number, placeholder: string) =>
                helperOptions.field(index.toString(), placeholder)
    };

    config.options['stylesheet.unitAliases'] = {
        ...resolveConfig({ type: 'stylesheet' }).options['stylesheet.unitAliases'],
        ...config.options['stylesheet.unitAliases']
    }

    return config;
}

const parseCompat = (abbr: string, options?: any) =>
    (
        options.type === 'stylesheet'
            ? parseStylesheet :
        options.type === 'markup'
            ? parseMarkup :
        stylesheetSyntaxes.includes(options.syntax)
            ? parseStylesheet :
        parseMarkup
    )(abbr, toConfig(options));

const extractCompat = (line: string, pos?: number, lookAheadOrOptions?: OldExtractThirdParam) =>
    extract(
        line,
        pos,
        typeof lookAheadOrOptions === 'boolean'
            ? { lookAhead: lookAheadOrOptions } 
            : lookAheadOrOptions
    );
type OldExtractThirdParam =
    | boolean
    | {
        lookAhead?: boolean,
        syntax?: string,
        prefix?: string
    }

const expandCompat = (abbr: string, options: HelperExpandOptions) =>
    expand(abbr, toConfig(options));

export { extractCompat as extract, expandCompat as expand, parseCompat as parse };