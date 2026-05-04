from playwright.sync_api import sync_playwright


def test_login_success():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto('http://localhost:5173/login')
        page.wait_for_load_state('networkidle')

        page.fill('#account', 'admin')
        page.fill('#password', 'admin123')
        page.click('.submit-button')

        page.wait_for_url('**/', timeout=10000)

        assert '/' in page.url, f"Expected to be redirected to home, but got {page.url}"

        browser.close()
        print("Test passed: Login success flow works correctly")


def test_login_failure():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto('http://localhost:5173/login')
        page.wait_for_load_state('networkidle')

        page.fill('#account', 'wronguser')
        page.fill('#password', 'wrongpassword')
        page.click('.submit-button')

        page.wait_for_selector('.alert-error', timeout=5000)
        error_alert = page.locator('.alert-error')
        assert error_alert.is_visible(), "Error alert should be visible after failed login"

        browser.close()
        print("Test passed: Login failure shows error message")


def test_navigate_to_register():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto('http://localhost:5173/login')
        page.wait_for_load_state('networkidle')

        page.click('.register-link')

        page.wait_for_url('**/register', timeout=5000)
        assert '/register' in page.url, f"Expected to navigate to register page, but got {page.url}"

        browser.close()
        print("Test passed: Navigate to register page works")


def test_navigate_to_forgot_password():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto('http://localhost:5173/login')
        page.wait_for_load_state('networkidle')

        page.click('.forgot-password-link')

        page.wait_for_url('**/forgot-password', timeout=5000)
        assert '/forgot-password' in page.url, f"Expected to navigate to forgot-password page, but got {page.url}"

        browser.close()
        print("Test passed: Navigate to forgot password works")


if __name__ == '__main__':
    print("Running login E2E tests...")

    try:
        test_login_success()
    except Exception as e:
        print(f"test_login_success FAILED: {e}")

    try:
        test_login_failure()
    except Exception as e:
        print(f"test_login_failure FAILED: {e}")

    try:
        test_navigate_to_register()
    except Exception as e:
        print(f"test_navigate_to_register FAILED: {e}")

    try:
        test_navigate_to_forgot_password()
    except Exception as e:
        print(f"test_navigate_to_forgot_password FAILED: {e}")

    print("\nAll tests completed!")
