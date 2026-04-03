# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the asset management frontend to a SaaS business dashboard style (dark sidebar + white content, Vercel/GitHub aesthetic) with Tailwind CSS properly configured.

**Architecture:** Install Tailwind CSS 3 with PostCSS. Restyle all 4 UI files (Layout, Login, Dashboard, AssetList) to match the approved dark-sidebar + white-content design with indigo accent color scheme.

**Tech Stack:** React 18, Tailwind CSS 3, PostCSS, Autoprefixer

---

### Task 1: Install and Configure Tailwind CSS

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/index.css`
- Modify: `frontend/src/index.js`

- [ ] **Step 1: Install Tailwind CSS and dependencies**

```bash
cd /home/neon/project/indgAsset/frontend
npm install -D tailwindcss postcss autoprefixer
```

- [ ] **Step 2: Create tailwind.config.js**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

- [ ] **Step 3: Create postcss.config.js**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 4: Create src/index.css with Tailwind directives**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Import index.css in src/index.js**

Add `import './index.css';` before `import App from './App';`

- [ ] **Step 6: Verify Tailwind is working**

Run: `cd /home/neon/project/indgAsset/frontend && npm start`
Expected: App loads with Tailwind styles applied (existing classes should now render correctly)

---

### Task 2: Redesign Layout.jsx (Sidebar + Header)

**Files:**
- Modify: `frontend/src/components/Layout.jsx`

Key design changes:
- Dark sidebar (`bg-gray-900`) with fixed width `w-60`
- Indigo branding text at top
- Nav items with icons (SVG), active state `bg-indigo-500/10 text-indigo-400`
- User info + logout at sidebar bottom
- Clean white header with notification bell (SVG icon instead of emoji) and user avatar circle
- Main content area `bg-gray-50`

- [ ] **Step 1: Rewrite Layout.jsx with new design**

Replace entire Layout.jsx with redesigned version including:
- SVG icons for each nav item (dashboard, assets, assignments, users)
- SVG bell icon replacing emoji
- Active route highlighting using `useLocation()`
- User avatar circle with initials
- Sidebar user section at bottom with role/department
- Collapsible sidebar preserved

- [ ] **Step 2: Verify layout renders correctly**

Run: `npm start`
Expected: Dark sidebar with indigo nav highlights, clean white header, gray-50 content area

---

### Task 3: Redesign Login.jsx

**Files:**
- Modify: `frontend/src/pages/Login.jsx`

Key design changes:
- Full-page gray-50 background
- Centered white card with subtle shadow-xl
- App logo/branding at top
- Refined input fields with `border-gray-300 focus:ring-indigo-500 focus:border-indigo-500`
- Indigo submit button with proper hover/disabled states

- [ ] **Step 1: Update Login.jsx styling**

Update classNames for:
- Outer container: `min-h-screen bg-gray-50 flex items-center justify-center`
- Card: `bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm`
- Inputs: proper border colors, focus ring, rounded-lg
- Button: `bg-indigo-600 hover:bg-indigo-700 transition`
- Error alert: `bg-red-50 border border-red-200 text-red-600`

- [ ] **Step 2: Verify login page renders correctly**

Run: `npm start`, navigate to `/login`
Expected: Clean centered login card on light gray background

---

### Task 4: Redesign Dashboard.jsx

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

Key design changes:
- Page header with greeting and subtitle
- 4 stat cards in a row: white bg, subtle shadow, colored accent (left border or icon)
- Stats use colored text: green(available), indigo(in_use), amber(maintenance), gray(disposed)
- Category/department sections in white cards with clean list styling
- Alert sections with left border accent instead of full background color
- Recent activity as clean table with dot indicators and relative timestamps

- [ ] **Step 1: Rewrite Dashboard.jsx with new card design**

Replace stat cards with white-bg cards:
- Each card: `bg-white rounded-xl shadow-sm p-5`
- Label: `text-sm text-gray-500`
- Value: `text-2xl font-bold` with status-specific color
- Small trend indicator text

Update category/department sections:
- White cards with clean dividers
- Consistent padding and font sizing

Update alert sections:
- `border-l-4 border-red-400 bg-white` instead of full red background
- Same pattern for warranty warnings with amber

Update recent activity:
- White card, clean rows with colored dot indicators
- Timestamp right-aligned in gray

- [ ] **Step 2: Verify dashboard renders correctly**

Run: `npm start`, login and view dashboard
Expected: Clean white stat cards, structured activity table, refined alert sections

---

### Task 5: Redesign AssetList.jsx

**Files:**
- Modify: `frontend/src/pages/AssetList.jsx`

Key design changes:
- Page header with title + "자산 등록" button (indigo, rounded)
- Search bar and filter in a white card toolbar
- Table in white card with subtle shadow
- Header row `bg-gray-50` with `text-xs uppercase tracking-wider text-gray-500`
- Rows with `hover:bg-gray-50` transition
- Status badges: pill-shaped with soft colors
- Pagination: rounded buttons, active state indigo

- [ ] **Step 1: Update AssetList.jsx styling**

Update classNames for:
- Search/filter toolbar: wrapped in white card
- Input: `border-gray-300 rounded-lg focus:ring-indigo-500`
- Table container: `bg-white rounded-xl shadow-sm overflow-hidden`
- Table header: `bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-medium`
- Table rows: `border-t border-gray-100 hover:bg-gray-50 transition`
- Status badges: rounded-full with soft color backgrounds
- Pagination: clean button group with indigo active state

- [ ] **Step 2: Verify asset list renders correctly**

Run: `npm start`, navigate to asset list
Expected: Clean table with proper spacing, colored status badges, refined search bar
