cd d:\project\cloudcad
pnpm --filter backend exec jest --passWithNoTests --verbose > test_result.txt 2>&1
exit $LASTEXITCODE
