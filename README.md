# Warren Dalawampu — Portfolio

Personal portfolio website for **Warren Dalawampu**, Senior Backend Developer & Systems Engineer.

## Stack

| Layer | Detail |
|---|---|
| **Server** | Nginx (direct, no Docker) |
| **Frontend** | HTML, CSS, JavaScript (vanilla, no frameworks) |
| **Domain** | `portfolio.warrdev.site` |

## Project Structure

```
portfolio/
├── index.html          # Single-page portfolio
├── css/
│   └── style.css       # Dark theme styles
├── js/
│   └── main.js         # Scroll animations, typewriter effect
├── nginx.conf          # Nginx server block config
├── Dockerfile          # Legacy Docker setup (deprecated)
└── README.md           # This file
```

## Deployment

The site is served directly by the host Nginx:

```bash
# Copy files to web root
sudo cp -r . /var/www/portfolio/
sudo chown -R www-data:www-data /var/www/portfolio

# Enable site
sudo ln -sf /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/portfolio
sudo nginx -t && sudo nginx -s reload
```

## DNS & Firewall

- **GCP VM:** `34.87.35.80`
- **Domain:** `portfolio.warrdev.site` → needs A record pointing to above IP
- **Firewall:** Port 80 must be open in GCP VPC firewall rules

## Features

- Dark theme with gradient accents
- Scroll-triggered fade-in animations
- Rotating hero title (typewriter effect)
- Responsive design (mobile-friendly)
- Gzip compression & security headers
- Static asset caching (30 days)
