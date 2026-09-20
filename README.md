# BTC Portfolio

Trang portfolio Bitcoin tĩnh của Mike, deploy qua GitHub Pages.

## Luồng dữ liệu

- Giao dịch được nhập trong một Google Sheet riêng tư, transaction-only.
- GitHub Actions đọc feed đã lọc mỗi ngày một lần. Secret `TX_FEED_URL` chỉ nằm trong repository settings, không nằm trong source.
- Giá BTC hiện tại và lịch sử lấy từ CoinGecko API mỗi 15 phút. Nếu API hoặc feed lỗi, workflow giữ snapshot hợp lệ gần nhất thay vì ghi số 0 hay làm hỏng trang.
- Mỗi snapshot public vẫn chứa lịch sử giao dịch, số BTC nắm giữ và giá vốn để trang hiển thị.

GitHub scheduled workflows có thể trễ vài phút khi hệ thống bận.

## Chạy tại máy

```bash
npm install
npm run dev
```
