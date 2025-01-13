# Hassle-free time tracking using [Elgato Stream Deck](https://www.elgato.com/en/gaming/stream-deck) and [Toggl Track](https://toggl.com/track/)

This repository is a fork to continue development of https://github.com/tobimori/streamdeck-toggl which has been discontinued and archived. Note that the Toggl plugin in the Stream Deck marketplace is the old plugin that is no longer maintained.

## ✏️ Setup

Download the latest .streamDeckPlugin file from [Releases](https://github.com/blueshiftone/streamdeck-toggl/releases) and double click to install into the Stream Deck app. Once installed, a button called "Toggl" will become available in section "Custom".

![PropertyInspector](resources/readme/PropertyInspector.png)

* **Title** is a default Stream Deck property available for every button in Stream Deck. You should leave it empty (see Button Label).
* **API Token** is your private API Token you can get from your [Toggl profile](https://track.toggl.com/profile). This Token is handled like a password. ***Don't share it***. Required.
* **Button Label** is used instead of *Title*. If the tracker isn't running, the Label is shown on the button. If the tracker is running the elapsed time is shown additionally. If *Title* is set, it will override *Button Label*.
* **Entry Name** describes the activity you want to report. It is not required but strongly recommended.
* **Workspace** is your workspace you start the time entries in. Required.
* **Project** is the project you want to assign the task to. Leave blank for no project. New projects can be added in Toggl.
* **Fallback** designates this button as a fallback button. A fallback button starts a defined activity as normal (e.g. "TBD"), but will indicate and stop any activity that's not handled by another button.
* **Billable** sets Toggl's billable flag (for Toggl paid plans only).

![StreamDeckScreenshot](resources/readme/StreamDeckScreenshot.png)

Just press any Toggl Button to start tracking time. The button should indicate tracking by turning red and showing the current tracking time (if no *Title* is set). The status of the button is defined by workspace, project and entry name. If you setup two identical buttons (even on different Stream Deck profiles), both button indicate the same. If you start or stop your timer using the Toggl app (web, desktop, mobile) Toggl for Stream Deck will follow by changing the status.

## 📞 Help

Please use GitHub Issues for reporting bugs and requesting new features.

## 📄 License

streamdeck-toggl is licensed under the [MIT License](LICENSE).

## Build & Debug Instructions

Prerequisites:
* Ensure your root folder as one.blueshift.streamdeck.toggl.sdPlugin
* Install the [Elgato CLI](https://www.npmjs.com/package/@elgato/cli)
* Enable developer mode with `streamdeck dev`

To debug locally:
```
cd [path]\one.blueshift.streamdeck.toggl.sdPlugin
streamdeck link
streamdeck restart one.blueshift.streamdeck.toggl
```

To build a .streamDeckPlugin installer:
```
cd [path]\one.blueshift.streamdeck.toggl.sdPlugin
streamdeck pack --version [new version] --output [output directory]
```

## Known Issues

* Changing the *Button Label* wont change the *Title* immediately. Restart Stream Deck.
