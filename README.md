
THIS PROJECT HASN'T BEEN TESTED MUCH YET !!!


##Functionality

Check for broken links in anchor-href tags in HTML documents. It checks broken links by trying to resolve HTTP and HTTPS links, and relative links (../folder/file.html) by checking if the file exist on the local file system.

Limitations:
* "href" has to be first attribute in anchor-href tag.
* Key parts of tag (a and href) must be all on one line.
* Doesn't check local "#name" links.
* Written to match the behavior of HtmlHint, not browsers.  HtmlHint objects to uppercase in tag and attribute names, doesn't allow single-quotes instead of double-quotes.

Note that checking for broken links is more of an art than a science. Some sites don't actually return 404, but send you to a landing page. For example, Azure.com works this way. You can go to https://Azure.com/foo/bar and it will happily redirect you to https://Azure.com, with no 404 status returned. So take a status of "OK" with a grain of salt - you may not be arriving at the page you intend.

##Install

Open Visual Studio Code and press `F1`; a field will appear at the top of the window. Type `ext install linkcheckerhtml`, hit enter, and reload the window to enable.

##Check for broken links

To check for broken links, open an HTML file and then press `Alt-L`.  Broken links are reported via the standard error/warning/information diagnostic icons in lower-left of UI.

##Changes

###0.2.0

* Copied from "Microsoft / linkcheckermd" and then greatly modified.
* Extension works, but probably has memory leaks, not much testing.

##TODO

* Status indication remains when it's done checking.
* Test outside debug environment.
* Warn about redirects.
* Allow extension options ?  Redirect handling, info about non-handled schemes.
* Remove need for local copy of node_modules tree ?
* Test Img-src, Script-src and Link-href tags too.
* Check mailto links for proper format ?
* Memory leaks ?
* Deactivate().
* Remove hard-coded paths.
* Allow anyone to file Issues.
* Register extension in Marketplace.

##QUIRKS

* Multiple identical link-targets on same line, clicking on diagnostic for any takes you to first link-target in source line.

##Development

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
