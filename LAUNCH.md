# 上线说明

部署者 / 原始创作者：`0x4fc6e37d6aefb348cff3791f493ce49754af905a`。

**先配套合约和网站，最后发币。** 主网交易由项目方本人检查并在本机签名。不要把私钥放进聊天、仓库、网页、Vercel 或脚本参数。

## 1. 安装与验收

```powershell
pnpm install --frozen-lockfile
forge build
pnpm test
pnpm build
pnpm test:e2e
pnpm preflight:mainnet
```

`preflight:mainnet` 仅做公开链上读取，不签名。没有正式钱包授权也可以执行。主网 fork 演练：

```powershell
$env:MAINNET_RPC_URL = '你的 Ethereum RPC'
pnpm test:fork
```

Logo 与 X 账号目前待补；`web/favicon.svg`、页面文字标识可替换。`config.json` 的 `links.twitter` 保持 `null` 时不会出现错误的社交链接。代币显示符号在 `brand.symbol` 配置。

## 2. 本机配置签名

使用加密 keystore：

```powershell
.\scripts\prepare-mainnet.ps1 -ImportKey
```

只在 Foundry 自己的隐藏交互提示里输入新钱包私钥，并设 keystore 密码。文件在 `$HOME\.foundry\keystores\dm-deployer`，不在项目内。脚本隐藏询问 RPC 与 Etherscan key，只放入当前进程环境，不读取 `$HOME\.web3\secrets.env`。

已有 keystore 时：

```powershell
.\scripts\prepare-mainnet.ps1
```

Ledger：

```powershell
.\scripts\prepare-mainnet.ps1 -Ledger
```

## 3. 由你执行主网部署

确认 config.admin 是新地址，config.token 是零地址；确认测试通过。然后在同一个 PowerShell 中执行：

```powershell
pnpm deploy:mainnet
```

脚本核对签名钱包，重新读取平台关键设置，部署一个不可升级的 Offline 合约，并请求 Etherscan 源码验证。没有发币，也不需要提前知道 CA。

Forge 模拟地址写入忽略的 `deployments/.pending-*`，只有广播成功且链上有代码后才写入 `deployments/1.json`。有现存部署文件时拒绝重复部署。任何广播阶段报错，都先检查 `broadcast/` 和 staging，不要直接重新执行。

```powershell
pnpm verify:deployment
```

还需在 Etherscan 确认源码已验证。若平台 API 暂时失败，恢复验证，不要因此重新部署。

## 4. 发布网站并验收后台

将新的公开 deployment manifest 提交到 GitHub。Vercel 使用仓库内配置构建静态站点：

```powershell
pnpm build
vercel --prod
```

`/admin` 连接新钱包，检查链、合约、creator 与未绑定状态。发币前的公众页面应诚实显示尚未启动，禁止正式存入。验证手机端、钱包切换及错误反馈。

## 5. 最后在 Stockereum 发币

使用原始创作者钱包 `0x4fc6e37d6aefb348cff3791f493ce49754af905a`，设置：

- 项目品牌 DM / Digital Minimalism，符号与 `brand.symbol` 一致。
- ETH 交易对。
- 正常交易费 3%。
- **Holder Rewards OFF**，创作者自行领取手续费。

平台正常拆分为 1% 平台、2% 创作者。开盘前 20 秒有临时更高反抢跑费率。发布前再次核对平台实际界面。

## 6. 后台绑定 CA

进入 `/admin`，填入刚发射的完整 CA，点击 Review token binding，检查确认说明后在钱包签名。绑定永久且唯一。

合约核对官方 factory/hook、原始 creator、10 亿供应量、WETH quote、3% fee 与创作者收款模式。绑定完成后，网站从链上读取并开放参与，无需再改代码或重新部署。

## 7. 手续费与奖励

后台按顺序操作，每步独立签名：

1. Claim WETH：从 Stockereum 托管领取到原始创作者自己的钱包。
2. Unwrap WETH：将选定的 WETH 解包为钱包内 ETH。
3. 填入 ETH 数量并 Review ETH funding：向 Offline 注资，按当时有效时间权重立即分配。

至少要有一位用户已存入，且时间权重大于零，才能注资。没有参与者时保留 ETH 在自己的钱包，不预先注资。

若误把 WETH 直接发到 Offline，后台会检测余额并提供 `fundWeth` 转换。WETH 转账本身不会形成奖励，转换时才分配，且任何人都可以触发转换。

## 运行边界

用户随时部分/全部取回，无期限、冷却、退出费或奖励没收。管理员暂停仅影响新增存入。转移管理员不转移 Stockereum 原始创作者的手续费权利。

网页公开奖励、地址和注资记录；不承诺隐私、不保证收益。代码开源与测试不等于外部审计。
