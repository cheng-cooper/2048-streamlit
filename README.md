# 2048 排行榜

## 在這台電腦啟動

先將 ZIP 完整解壓縮。若舊版仍在執行，到舊版的命令視窗按 Ctrl+C。接著雙擊新版的 `start.cmd`。看到 `Running on http://127.0.0.1:5050` 後，保持命令視窗開啟，用瀏覽器開啟該網址。也可以在 VS Code 開啟解壓後的資料夾，在 PowerShell 執行：

```powershell
& "$env:USERPROFILE\venv\Scripts\python.exe" app.py
```

按 Ctrl+C 停止。預設使用本機 SQLite，第一次讀取排行榜時會建立 `leaderboard.sqlite3`。

首頁可註冊、登入，或輸入暱稱以訪客身分開始。註冊完成後會自動登入。帳號資料存在 `accounts.sqlite3`，密碼以雜湊儲存。重啟 Flask 後需要重新登入，帳號仍可使用。

用方向鍵或滑動棋盤合併方塊。當棋盤無法移動或合成 2048 時，本局結束並自動登記分數。若登記失敗，可按「重試登記」。帳號與同名訪客各自保留最高分，排行榜顯示前 10 名。分數由瀏覽器提交，適合本機課堂展示。

每局從開局開始計時，只有使棋盤改變的操作才計一步。登記通關成績後，排行榜也會更新「最快通關」和「最少步數」，各自保留每位玩家的最佳紀錄。

按「結束本局」可提早結算，顯示本局分數、時間及步數，分數會自動列入最高分榜。最快通關和最少步數只收錄合成 2048 的紀錄。

按「返回主頁」可離開目前的棋局，再次開始時會開新的一局。返回主頁會保留登入狀態與已登記的成績。

如果啟動器提示找不到 Python 或 Flask，請先安裝 Python 3.10 或以上，再在專案資料夾的終端機建立專案專用環境：

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install Flask
.\start.cmd
```

## 改用 Redis

準備可連線的 Redis 6.2 或更新版本。若已有 Docker，可在 PowerShell 啟動本機 Redis：

```powershell
docker run -d --name redis-2048 -p 127.0.0.1:6379:6379 -v redis-2048-data:/data redis redis-server --appendonly yes
```

停止原本的 Flask，再於同一個 PowerShell 視窗安裝套件、設定 Redis 位址並啟動：

```powershell
$python = "$env:USERPROFILE\venv\Scripts\python.exe"
if (Test-Path .\.venv\Scripts\python.exe) { $python = ".\.venv\Scripts\python.exe" }
if (-not (Test-Path $python)) { $python = "py" }
& $python -m pip install -r requirements.txt
$env:REDIS_URL = "redis://127.0.0.1:6379/0"
.\start.cmd
```

最高分資料存進 `2048:leaderboard` 排序集合。通關時間和步數分別存進 `2048:leaderboard:time`、`2048:leaderboard:steps`。SQLite 與 Redis 各自保存成績。要切回本機 SQLite，移除目前終端機的 `REDIS_URL` 環境變數，再重新啟動 Flask。
