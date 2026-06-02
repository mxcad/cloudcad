from playwright.sync_api import sync_playwright

def test_login_flow():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console errors
        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        # 1. Navigate to login page
        print("1. Navigating to login page...")
        page.goto('http://localhost:5181/login')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        # 2. Check login page rendered correctly
        print("2. Checking login page elements...")
        title = page.title()
        print(f"   Page title: {title}")

        # Look for login form elements
        account_tab = page.locator('text=账号登录')
        if account_tab.is_visible():
            print("   [OK] Account login tab visible")
        else:
            print("   [WARN] Account login tab not found")

        # Check for password field
        password_field = page.locator('input[type="password"]')
        if password_field.is_visible():
            print("   [OK] Password field visible")
        else:
            print("   [WARN] Password field not found")

        # 3. Test route.state by navigating to protected page
        print("3. Testing route.state by accessing protected page...")
        page.goto('http://localhost:5181/dashboard')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        current_url = page.url
        print(f"   Redirected to: {current_url}")

        if '/login' in current_url:
            print("   [OK] Correctly redirected to login for unauthenticated access")

            # Check if 'from' state was captured
            # The URL should contain redirect query param
            if 'redirect' in current_url:
                print("   [OK] Redirect query parameter preserved")
        else:
            print("   [WARN] Not redirected to login page")

        # 4. Check console errors
        print("4. Checking for console errors...")
        if console_errors:
            print(f"   [ERROR] Found {len(console_errors)} console errors:")
            for err in console_errors[:5]:
                print(f"      - {err[:100]}")
        else:
            print("   [OK] No console errors")

        # 5. Test login form interaction
        print("5. Testing login form interaction...")
        page.goto('http://localhost:5181/login')
        page.wait_for_load_state('networkidle')

        # Fill in login form
        account_input = page.locator('input').first
        if account_input.is_visible():
            account_input.fill('test@example.com')
            print("   [OK] Account field filled")

        password_input = page.locator('input[type="password"]')
        if password_input.is_visible():
            password_input.fill('password123')
            print("   [OK] Password field filled")

        # Check for submit button
        submit_btn = page.locator('button[type="submit"]')
        if submit_btn.is_visible():
            print("   [OK] Submit button visible")
        else:
            print("   [WARN] Submit button not found")

        print("\n=== Login Flow Test Complete ===")
        browser.close()

if __name__ == "__main__":
    test_login_flow()