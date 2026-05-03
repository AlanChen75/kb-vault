// Quick RWD screenshot script — uses system Chrome via playwright-chromium
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'

const breakpoints = [
  { name: 'mobile',  width: 375,  height: 812  },  // iPhone X-ish
  { name: 'tablet',  width: 768,  height: 1024 },  // iPad portrait
  { name: 'desktop', width: 1280, height: 720  },  // typical laptop
]

const outDir = './rwd-screenshots'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })

for (const bp of breakpoints) {
  const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height } })
  const page = await ctx.newPage()
  await page.goto('http://localhost:5176/', { waitUntil: 'domcontentloaded', timeout: 15000 })

  // Wait briefly for React render
  await page.waitForTimeout(1500)

  const path = join(outDir, `${bp.name}-${bp.width}x${bp.height}.png`)
  await page.screenshot({ path, fullPage: false })
  console.log(`✓ ${bp.name} (${bp.width}x${bp.height}) → ${path}`)

  // Check expected elements
  const sidebarVisible = await page.locator('aside').isVisible().catch(() => false)
  const menuBtnVisible = await page.locator('button[aria-label="menu"]').isVisible().catch(() => false)
  const expectMobile = bp.width < 1024

  console.log(`  sidebar visible: ${sidebarVisible} (expected: ${!expectMobile ? 'yes' : 'no'})`)
  console.log(`  hamburger visible: ${menuBtnVisible} (expected: ${expectMobile ? 'yes' : 'no'})`)

  // Mobile drawer test
  if (expectMobile && menuBtnVisible) {
    await page.locator('button[aria-label="menu"]').click()
    await page.waitForTimeout(300)
    const drawerPath = join(outDir, `${bp.name}-${bp.width}x${bp.height}-drawer.png`)
    await page.screenshot({ path: drawerPath, fullPage: false })
    console.log(`  drawer screenshot → ${drawerPath}`)
  }

  await ctx.close()
}

await browser.close()
console.log('\n✓ RWD check complete')
