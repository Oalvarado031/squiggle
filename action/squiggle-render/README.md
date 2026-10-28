# squiggle-render

A GitHub Action that renders every `.sqg` file in your repository to a PNG on push, so READMEs can show the art.

<!-- sync:action-uses -->
```yaml
name: Render Squiggle pieces
on:
  push:
    paths: ['**.sqg']
permissions:
  contents: write
jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: YOUR-ACCOUNT/squiggle/action/squiggle-render@main
        with:
          commit: 'true'
```

Replace `YOUR-ACCOUNT/squiggle` with the repository that hosts Squiggle.
<!-- /sync:action-uses -->

Then in a README: `![tide](pieces/tide.png)`.

| input | default | |
|---|---|---|
| `path` | `.` | folder to search for `.sqg` files |
| `out` | (next to each file) | folder for the PNGs, mirroring the source folders |
| `size` | `1024` | PNG size in pixels |
| `t` | `1` | the moment (seconds) drawn for pieces that move |
| `commit` | `false` | commit and push the PNGs back |
| `message` | `Render Squiggle pieces` | commit message |

Output `files` lists the PNGs written. A piece with an error fails the step and is annotated on its file. Runs on Linux, macOS and Windows runners.
