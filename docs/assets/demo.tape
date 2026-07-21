# VHS Tape: OpenAgentFlow Quick Summarize Demo
# To record via Docker using the custom vhs-ai container (see handover guide for build command):
#   PowerShell: docker run --rm -v "$($PWD.Path):/vhs" -e OPENAI_API_KEY="$env:OPENAI_API_KEY" -e GOOGLE_API_KEY="$env:GOOGLE_API_KEY" vhs-ai docs/assets/demo.tape
#   Bash/Zsh:   docker run --rm -v "${PWD}:/vhs" -e OPENAI_API_KEY -e GOOGLE_API_KEY vhs-ai docs/assets/demo.tape

Output docs/assets/demo.gif

# Fail early if required binaries aren't installed in the recording environment
Require node
Require python3
Require pygmentize

# Shell & Terminal Optimizations
Set Shell "bash"
Set CursorBlink false
Set Framerate 60
Set FontSize 16
Set FontFamily "JetBrains Mono"

Set Width 1200
Set Height 700
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set Padding 10
Set TypingSpeed 50ms

Hide
Sleep 500ms
Type "export PS1='OpenAgentFlow > '"
Enter
Type "alias oaf='node cli/index.js'"
Enter
Type "alias cat='pygmentize -O style=catppuccin-mocha -g'"
Enter
Type "clear"
Enter
Show

# Step 1: Initial breathing pause after prompt appears, then display clean .oaf workflow syntax
Sleep 500ms
Type@70ms "cat examples/summarize.oaf"
Sleep 200ms
Enter
Sleep 2s


# Step 2: Clear screen
Type@50ms "clear"

Enter
Sleep 300ms


# Step 3: Execute workflow
Set LineHeight 1.5
Type@30ms "oaf run examples/summarize.oaf -i examples/summarize-input.json --demo"
Sleep 600ms
Enter


# Step 4: Show execution result
Sleep 6s


# Step 5: Smooth loop
Type@40ms "clear"
Enter
Sleep 2s