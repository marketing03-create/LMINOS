# Push every var from .env.local to Vercel (production env),
# EXCEPT LMIROS_DEV_BYPASS_AUTH which must never be set in production.
# Run from the lmiros/ directory:  pwsh scripts\push-env.ps1

$envFile = ".env.local"
$skipList = @("LMIROS_DEV_BYPASS_AUTH")

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    # Strip surrounding double quotes if present
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    if ($skipList -contains $name) {
        Write-Host "SKIP $name (in skip list)" -ForegroundColor Yellow
        return
    }
    if ($value -eq "") {
        Write-Host "SKIP $name (empty value)" -ForegroundColor Yellow
        return
    }
    Write-Host "PUSH $name" -ForegroundColor Cyan
    $value | vercel env add $name production 2>&1 | Where-Object { $_ -match "Added|already exists|Error|error" } | ForEach-Object { Write-Host "  $_" }
}
