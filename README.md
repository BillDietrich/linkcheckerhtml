# HTML link checker

VSCode extension that checks for broken links in HTML files.

THIS PROJECT ISN'T RELEASED YET !!!

## Functionality
Check for broken links in anchor-href, link-href, img-src, and script-src tags in HTML documents. It checks broken links by trying to resolve HTTP and HTTPS links, and relative links (../folder/file.html) by checking if the file exist on the local file system.

Also checks for badly-formatted mailto links.

### Settings
* linkcheckerhtml.checkMailtoDestFormat: Check format of email addresses in mailto links.
* linkcheckerhtml.reportNonHandledSchemes: Report (as Information) links with URI schemes not checked by the checker, such as FTP and Telnet.
* linkcheckerhtml.reportRedirectAsError: Report (as Error) links that get redirected.

### Limitations
* "href" or "src" has to be first attribute in the tag.
* Tag and first attribute must be on the same line.
* Doesn't check local "#name" links.
* Written to match the behavior of HtmlHint, not browsers.  HtmlHint objects to uppercase in tag and attribute names, doesn't allow single-quotes instead of double-quotes.
* Doesn't check EVERY detail of the email address spec in mailto links.  Just a cursory check.

Note that checking for broken links is more of an art than a science. Some sites don't actually return 404, but send you to a landing page. For example, Azure.com works this way. You can go to https://Azure.com/foo/bar and it will happily redirect you to https://Azure.com, with no 404 status returned. So take a status of "OK" with a grain of salt - you may not be arriving at the page you intend.

#### Quirks
* If there are multiple identical tags with identical link-targets on same line (for example two Anchor tags with identical href targets), clicking on diagnostic for any of them takes you to first link-target in the source line.
* Doesn't check ANY of the email address format after "?", as in "mailto:a@b.com?subject=xyz".


## Install
Open Visual Studio Code and press `F1`; a field will appear at the top of the window. Type `ext install linkcheckerhtml`, hit enter, and reload the window to enable.


## Use
To check for broken links, open an HTML file and then press `Alt-L`.  Broken links are reported via the standard error/warning/information diagnostic icons in lower-left of UI.

To see/change settings for the extension, open Settings / Extensions / HTML link checker



## Releases

### 0.2.0
* Copied from "Microsoft / linkcheckermd" and then greatly modified.
* Extension works, but probably has memory leaks, not much testing.


## Development

### To-Do list
* Test on many real web pages.
* Report more info from broken-link, such as HTTP return code.  CAN'T BE DONE !!!
* Change to use node-fetch module (https://github.com/bitinn/node-fetch) instead of broken-link ?
* Change to use uri-js module to parse URIs ?
* Try uninstalling pinkie-promise, see what happens.
* Find URL-click extension that makes human-checking easy.
* Get rid of: "href" or "src" has to be first attribute in the tag.
* Multi-line tag silently ignored.
* Test outside debug environment.
* Remove need for local copy of node_modules tree ?
* Memory leaks ?
* Remove hard-coded paths.
* Allow anyone to file Issues.
* Register extension in Marketplace.


### Development Environment
I don't really know what I'm doing with much of this stuff, probably I'm doing some things stupidly.

I used:
* Linux Mint 19
* VSCode 1.29.1 (which says Node.js 8.9.3)
* node 8.10.0
* npm 3.5.2
* sudo npm -g install --save pinkie-promise (used by broken-link)
* sudo npm -g install --save broken-link
* Yeoman

I did:
* Ran Yeoman to make a Typescript test extension, then copied the entire node_module directory tree from there to linkcheckerhtml directory.
* Put path to node_module directory tree in vscode-typings.d.ts
* Extension.ts has a hard-coded path
to broken-link/index.js
