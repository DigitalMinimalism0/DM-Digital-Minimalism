param([switch]$ImportKey,[switch]$Ledger,[string]$Account='dm-deployer')
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Write-Host 'Preparation only. No mainnet transaction is sent.'
foreach($name in @('PRIVATE_KEY','ETH_PRIVATE_KEY','DEPLOY_PRIVATE_KEY')){if([Environment]::GetEnvironmentVariable($name)){throw 'Unset plaintext signer keys. Use interactive Foundry import.'}}
if($ImportKey -and $Ledger){throw 'Choose keystore OR Ledger.'}
if($Account -notmatch '^[A-Za-z0-9_-]+$'){throw 'Invalid keystore account name.'}
if($Ledger){Remove-Item Env:DEPLOY_ACCOUNT -ErrorAction SilentlyContinue; $env:DEPLOY_LEDGER='1'}else{
 if($ImportKey){& cast wallet import $Account --interactive;if($LASTEXITCODE -ne 0){throw 'Import failed.'}}
 Remove-Item Env:DEPLOY_LEDGER -ErrorAction SilentlyContinue
 $env:DEPLOY_ACCOUNT=$Account
}
function Read-Hidden([string]$Prompt){$value=Read-Host $Prompt -AsSecureString;try{return [System.Net.NetworkCredential]::new('',$value).Password}finally{$value.Dispose()}}
if(-not $env:MAINNET_RPC_URL){$env:MAINNET_RPC_URL=Read-Hidden 'Mainnet RPC URL (hidden)'}
if(-not $env:ETHERSCAN_API_KEY){$env:ETHERSCAN_API_KEY=Read-Hidden 'Etherscan API key (hidden)'}
& node scripts/preflight.mjs --signer
if($LASTEXITCODE -ne 0){throw 'Preflight failed. Nothing deployed.'}
Write-Host 'Review config.json and the tests. Deploy yourself with: pnpm deploy:mainnet'
