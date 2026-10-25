# Content tools (Phase 8)

## Record clips: `/?studio=1`
1. Open `https://dustinnnn4678.github.io/neverend-city/?studio=1` in Chrome.
2. **Shape the video by resizing the browser window first.** Make it tall and narrow (like a phone) for 9:16 Reels/Shorts, or wide for 16:9 YouTube. (Chrome DevTools → device toolbar also works.)
3. Press **Record 20 s flyover** or **Record 30 s growth time-lapse** (the city grows from almost nothing to today's size). Press **Stop and save** to finish early.
4. A `.webm` file downloads. Instagram and YouTube want MP4: drag it into the free **HandBrake** app, or run `ffmpeg -i clip.webm -c:v libx264 -pix_fmt yuv420p clip.mp4`. CapCut also opens WebM.
Tip: for a nicer clip pick the time of day first (⚙ menu → Day/Night), and use the **High** quality setting.

## Milestone countdown: `/countdown.html`
Shows how many followers are left to the next milestone and lights up an "ALMOST THERE" badge inside 10%. Share the link, or screen-record it for a clip.

## Embeddable city: `/?embed=1`
Other creators can paste this on their site:
```html
<iframe src="https://dustinnnn4678.github.io/neverend-city/?embed=1" width="100%" height="420" style="border:0;border-radius:12px" loading="lazy" title="Neverend City"></iframe>
```
It is a clean, slowly turning city with a "get your own building" link back to you.

## Not built yet
Automatic daily time-lapse/"building of the day"/weekly recap videos, player spotlight sign-up, and the referral dashboard. The recorder above is the building block: those can be added on top once real players exist.
