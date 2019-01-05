# HTML link checker
VSCode extension that checks for broken links in HTML files.

## Functionality
Check for broken links in anchor-href, link-href, img-src, and script-src tags in current HTML document. It checks broken links by trying to access HTTP and HTTPS links, and relative links (../folder/file.html) by checking if the file exists on the local file system.

Also checks for badly-formatted mailto links, and duplicate local anchors (anchor-name, anchor-id).

## Use
To check for broken links, open an editor on an HTML file and then press `Alt+H`.  Broken links are reported via the standard error/warning/information diagnostic icons in lower-left of UI.  Click on a diagnostic line, see that link highlighted in the source file, press `Alt+T` to open that URL in your default browser.

Tip: After you do Alt+H and get diagnostics, work on the problems from bottom (last diagnostic) to top (first diagnostic).  That way the line numbers don't change out from under the diagnostics if you delete lines.

To see/change settings for this extension, open Settings (Ctrl+,) / Extensions / HTML link checker.

To change the key-combinations for this extension, open File / Preferences / Keyboard Shortcuts and search for Alt+H or Alt+T.

### Settings
* linkcheckerhtml.checkMailtoDestFormat: Check format of email addresses in mailto links (default is true).
* linkcheckerhtml.maxParallelThreads: Maximum number of links to check in parallel (range is 1 to 20; default is 20).
* linkcheckerhtml.timeout: Timeout (seconds) for accessing a link (range is 5 to 30; default is 12).
* linkcheckerhtml.reportNonHandledSchemes: Report links with URI schemes not checked by the checker, such as FTP and Telnet (default is "as Information").
* linkcheckerhtml.reportRedirect: Report links that get redirected (default is "as Warning").
* linkcheckerhtml.localRoot: String prepended to links that start with "/" (default is ".").
* linkcheckerhtml.userAgent: User-Agent value used in Get requests (default is "Mozilla/5.0 Firefox/63.0").

### Limitations
* Tag name and href/src/id attribute must be on the same line.
* Doesn't know about comments; will find and check tags inside comments.
* Checks "#name" links to targets in current file, but not in other local or remote files.
* Written to match the behavior of HtmlHint, not browsers.  HtmlHint objects to uppercase in tag and attribute names, doesn't allow single-quotes instead of double-quotes.
* Doesn't check EVERY detail of the email address spec in mailto links.  Just a cursory check.

Note that checking for broken links is more of an art than a science. Some sites don't actually return 404, but send you to a landing page. For example, Azure.com works this way. You can go to https://Azure.com/foo/bar and it will happily redirect you to https://Azure.com, with no 404 status returned. So take a status of "OK" with a grain of salt - you may not be arriving at the page you intend.

#### Quirks
* If there are multiple identical tags with identical link-targets on same line (for example two Anchor tags with identical href targets), clicking on diagnostic for any of them takes you to first link-target in the source line.
* Doesn't check ANY of the email address format after "?", as in "mailto:a@b.com?subject=xyz".

---

## Install
### From the Marketplace
Open Visual Studio Code and press `F1`; a field will appear at the top of the window. Type `ext install linkcheckerhtml`, hit enter, and reload the window to enable.

### From VSIX file
Either:
* In CLI, do "code --install-extension linkcheckerhtml-n.n.n.vsix", or
* In VSCode GUI, in the Extensions view "..." drop-down, select the "Install from VSIX" command.

### From source code
* Do a git clone to copy the source code to "linkcheckerhtml" in your home directory.
* In CLI, "cd linkcheckerhtml" and then "./CopyToHomeToRunInNormal.sh"

---

## Releases
### 0.2.0
* Copied from "Microsoft / linkcheckermd" and then greatly modified.
* Extension works, but probably has memory leaks, not much testing.

### 0.3.0
* Changed to use node-fetch module (https://github.com/bitinn/node-fetch) instead of broken-link.  But has bad hangs.
* Changed to use got module (https://github.com/sindresorhus/got) instead of node-fetch.  But has bad hangs.
* Changed to use axios module (https://github.com/axios/axios) instead of node-fetch.  Works, but hangs on some URLs.
* Changed to throttle so that it checks max of 4 links in parallel.
* Changed settings to use pull-downs: error, warn, info, don't report

### 0.4.0
* Finally nailed that hang bug.
* Added setting for timeout.
* Fixed timeout and redirect settings.

### 0.5.0
* Added Alt+T to open an URL in a browser.
* First release with a VSIX file.

### 0.6.0
* Got rid of: "href" or "src" has to be first attribute in the tag.
* Require at least one "." in mailto address's domain.
* Try to dispose memory properly to avoid leaks.
* Handle local files with "?args" on the end.

### 0.7.0
* Added localRoot setting.
* Fixed mailto that ends with "?".
* Added userAgent setting, and it definitely makes some sites happier.

### 1.0.0
* Increased default timeout to 12.
* Check local anchors (#name) in current file.
* Support anchor-id (HTML5) as well as anchor-name.

---

## Development
### To-Do list
* Fair amount of duplicate code for creating a diagnostic, probably should move to a function.
* Any way to do retries in axios ?  Apparently not.
* Memory leaks ?  Doesn't seem to be any tool to check an extension for leaking.  Maybe not possible, since extensions are running inside a huge framework of Electron or Node or something.
* Display a "busy" cursor ?  Can't.  Window.withProgress could put up a dialog, but then user would have to close the dialog manually every time, don't want that.  Doesn't seem to be a way to close that dialog programmatically.
* Click on diagnostic, do Alt-T to browser, come back to VSCode, cursor is in filter field of diagnostics pane instead of in source file.  More convenient if in source file.  But seems to be no way to do it.
* Multi-line tag (tag name and href/src attribute on different lines) silently ignored.  Would be a lot of work to deal with, given the simple way the code does parsing.
* Remove need for local copy of node_modules tree during development ?  Seems to be standard.

### Development Environment
I don't really know what I'm doing with much of this stuff, probably I'm doing some things stupidly.

I used:
* Linux Mint 19
* VSCode 1.29.1 (which says Node.js 8.9.3)
* node 8.10.0
* npm 3.5.2
* axios
* Yeoman

I did:
* Ran Yeoman to make a Typescript test extension, then copied the entire node_module directory tree from there to linkcheckerhtml directory.
* Put path to node_module directory tree in vscode-typings.d.ts
* "sudo npm -g install --save axios" then copy /usr/local/lib/node_modules/axios to project node_modules
