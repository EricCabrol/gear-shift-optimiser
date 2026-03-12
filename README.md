# gear-shift-optimiser

Asked Claude to recreate a version based on https://www.yourdatadriven.com/the-best-rpm-to-shift-gears-in-a-racing-car/
See also
https://academy.yourdatadriven.com/courses/racecar-gear-shift-optimisation-calculator

Claude discussion is here (SR) : https://claude.ai/chat/99d8da88-6f03-4837-ad43-13c2b0b9742c


# Quick guide

Code is in src/App.tsx
Run (Powershell) with `npm run dev`
`o`to open the browser, `q` to quit




# Prompt

Based on https://www.yourdatadriven.com/the-best-rpm-to-shift-gears-in-a-racing-car propose a web tool to implement the same feature. Explain your options before implementation

# Claude proposal

Great, I've fully read the article. Here's a breakdown of what it covers and the tool options before I build anything.

## What the article computes

The core algorithm, in order:

1. **Inputs:** Torque curve (RPM → torque), gear ratios, final drive ratio, tyre size
2. **Step 1 — Speed vs RPM per gear:** Using the formula `RPM × 60 × tyre_circumference / 63360 / (gear_ratio × final_drive)` → mph in each gear
3. **Step 2 — Wheel torque per gear:** Multiply engine torque by overall gear ratio (gear × final drive) for each gear
4. **Step 3 — Torque vs road speed per gear:** Map the above two together
5. **Step 4 — Find intersections:** Where two adjacent gear curves cross on the torque-vs-speed chart → that speed is the optimal shift point
6. **Step 5 — Back-calculate RPM:** At each crossing speed, read off the RPM in the lower gear → that's your upshift RPM (and downshift RPM from the higher gear at the same speed)
7. **Output:** A table of optimal upshift/downshift RPMs for each gear pair, plus charts

---

## Tool design options

Here are three approaches, ordered by richness:

### Option A — Simple calculator (minimal UI)
User enters gear ratios, final drive, tyre size, and a few torque/RPM data points manually. The tool outputs the shift table. **Pro:** Simple and fast. **Con:** No visualisation, limited to a fixed torque curve shape.

### Option B — Interactive tool with editable torque curve + charts *(recommended)*
User fills in a configurable torque curve (table of RPM → torque points), gear ratios, and tyre size. The tool draws the torque-vs-speed chart for each gear with the "frontier" highlighted, shows intersection points visually, and outputs the shift table. This matches the full article experience. **Pro:** Visual, educational, mirrors the article exactly. **Con:** Slightly more complex to use.

### Option C — Preset car profiles + CSV import
Extend Option B with built-in car presets (e.g. Mazda MX5 as in the article) and the ability to paste/import a CSV torque curve from a dyno. **Pro:** Power-user friendly. **Con:** More UI complexity.

---

**My recommendation is Option B** — it faithfully reproduces the full methodology from the article with interactive charts (torque vs speed per gear with the optimal frontier), the shift point table, and the RPM vs speed chart. It gives the most educational and useful experience with manageable complexity. Shall I go ahead and build it?


# Implementation of option B

Here's your fully interactive **Race Car Gear Shift Optimizer**! It implements the complete 6-step methodology from the article. Here's a quick guide to using it:

**⚙️ Car Setup tab** — enter your gear ratios, final drive ratio, number of gears, and tyre size. It defaults to the Mazda MX5 example from the article.

**📈 Torque Curve tab** — edit the RPM vs torque table to match your dyno/rolling road data. A live preview chart updates as you type.

**🏆 Shift Points tab** — the main output: optimal upshift and downshift RPM for every gear pair, with the crossing speed. Ready to print or program into your dash shift lights.

**📊 Charts tab** — two charts from the article: Wheel Torque vs Speed (with the gear intersection "frontier") and RPM vs Speed per gear. Vertical dashed lines mark the optimal shift speeds.

Everything recalculates instantly when you change any input. You can swap in your own torque curve, gear ratios, and tyre spec to get personalised shift points for your car.


# Install

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install recharts lucide-react
```
Then just replace the contents of src/App.tsx with the artifact code.

Run with 
```bash
npm run dev
```
Then type o to open the server (http://localhost:5173)
