/*--------------------------------------------------------------------------------------
 *  The React build (build.js) runs scope-tailwind with `-p "void-"`, which rewrites every
 *  className in the JSX (`className='wfe-root selected'` → `void-wfe-root void-selected`) but
 *  not the selectors inside a CSS string given to <style>. Pass such CSS through scopedCss so
 *  its class selectors get the same prefix and still match.
 *--------------------------------------------------------------------------------------*/

/** Must match the `-p` option of scope-tailwind in build.js. */
export const CLASS_PREFIX = 'void-';

/** Adds CLASS_PREFIX to every class selector (`.name`) in `css`. Numbers such as `.15s` are left alone. */
export const scopedCss = (css: string): string =>
	css.replace(/(?<!\d)\.(?=[A-Za-z_])/g, `.${CLASS_PREFIX}`);
