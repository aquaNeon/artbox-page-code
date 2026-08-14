# Drops the jsDelivr edge cache for the @main URLs.
# Branch URLs are cached ~12h, so run this after every push or the
# live site keeps serving the previous file.

$files = @('page-transition.js', 'page-transition.css')

foreach ($f in $files) {
  $url = "https://purge.jsdelivr.net/gh/aquaNeon/artbox-page-code@main/$f"
  try {
    $res = Invoke-RestMethod -Uri $url -Method Get -ErrorAction Stop
    Write-Host "purged  $f  ->  $($res.status)"
  } catch {
    Write-Host "FAILED  $f  ->  $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "Hard-reload the published site (Ctrl+Shift+R) to confirm."
