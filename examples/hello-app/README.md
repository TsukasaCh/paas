# hello-app — sample untuk menguji Ronaldo Cloud

Aplikasi Node minimal (tanpa dependency) + `Dockerfile`. Dipakai untuk membuktikan
Deployment Worker benar-benar bisa `docker build` + `docker run`.

## Uji cepat Docker (tanpa lewat UI)
Pastikan Docker Desktop menyala, lalu dari folder ini:

```bash
docker build -t hello-app .
docker run -d -p 8080:3000 -e GREETING="Test env var" hello-app
curl http://localhost:8080
# → {"message":"Test env var", ...}
```

## Uji lewat Ronaldo Cloud
1. Push folder ini ke sebuah repo GitHub Anda (root repo harus berisi `Dockerfile`).
2. Di dashboard Ronaldo Cloud: New Project → Add Service (App) → pilih repo & branch →
   isi env var `GREETING` → Buat → Deploy.
3. Worker akan clone → build → run pada port dinamis, dan log tampil realtime.
