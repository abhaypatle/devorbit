from __future__ import annotations

from typing import Any


CATEGORY_ASSETS: dict[str, dict[str, Any]] = {
    "clothes": {
        "hero_text": "Discover styles made for you.",
        "image": "photo-1445205170230-053b83016050",
        "map_coordinates": {"latitude": 19.076, "longitude": 72.8777},
        "products": [
            {"name": "Everyday Cotton Kurta", "price": 1299.0, "category": "Clothing"},
            {"name": "Classic Denim Jacket", "price": 2499.0, "category": "Clothing"},
            {"name": "Festive Printed Saree", "price": 3299.0, "category": "Clothing"},
        ],
    },
    "clothing": {
        "hero_text": "Discover styles made for you.",
        "image": "photo-1445205170230-053b83016050",
        "map_coordinates": {"latitude": 19.076, "longitude": 72.8777},
        "products": [
            {"name": "Everyday Cotton Kurta", "price": 1299.0, "category": "Clothing"},
            {"name": "Classic Denim Jacket", "price": 2499.0, "category": "Clothing"},
            {"name": "Festive Printed Saree", "price": 3299.0, "category": "Clothing"},
        ],
    },
    "furniture": {
        "hero_text": "Make room for comfort and good design.",
        "image": "photo-1555041469-a586c61ea9bc",
        "map_coordinates": {"latitude": 12.9716, "longitude": 77.5946},
        "products": [
            {"name": "Oak Lounge Chair", "price": 8999.0, "category": "Furniture"},
            {"name": "Modern Side Table", "price": 4499.0, "category": "Furniture"},
            {"name": "Modular Sofa", "price": 28999.0, "category": "Furniture"},
        ],
    },
    "furniture / interior": {
        "hero_text": "Make room for comfort and good design.",
        "image": "photo-1555041469-a586c61ea9bc",
        "map_coordinates": {"latitude": 12.9716, "longitude": 77.5946},
        "products": [
            {"name": "Oak Lounge Chair", "price": 8999.0, "category": "Furniture"},
            {"name": "Modern Side Table", "price": 4499.0, "category": "Furniture"},
            {"name": "Modular Sofa", "price": 28999.0, "category": "Furniture"},
        ],
    },
    "kirana": {
        "hero_text": "Your daily essentials, delivered with care.",
        "image": "photo-1542838132-92c53300491e",
        "map_coordinates": {"latitude": 19.076, "longitude": 72.8777},
        "products": [
            {"name": "Basmati Rice (5 kg)", "price": 649.0, "category": "Groceries"},
            {"name": "Toor Dal (1 kg)", "price": 159.0, "category": "Groceries"},
            {"name": "Everyday Cooking Oil (1 L)", "price": 149.0, "category": "Groceries"},
        ],
    },
    "restaurant": {
        "hero_text": "Freshly prepared, ready to make your day.",
        "image": "photo-1517248135467-4c7edcad34c4",
        "map_coordinates": {"latitude": 18.5204, "longitude": 73.8567},
        "products": [
            {"name": "House Special Thali", "price": 299.0, "category": "Meals"},
            {"name": "Paneer Tikka", "price": 249.0, "category": "Starters"},
            {"name": "Mango Lassi", "price": 99.0, "category": "Drinks"},
        ],
    },
    "salon": {
        "hero_text": "A little time for you, beautifully spent.",
        "image": "photo-1560066984-138dadb4c035",
        "map_coordinates": {"latitude": 28.6139, "longitude": 77.209},
        "products": [
            {"name": "Signature Haircut", "price": 599.0, "category": "Services"},
            {"name": "Glow Facial", "price": 1499.0, "category": "Services"},
            {"name": "Hair Spa", "price": 1199.0, "category": "Services"},
        ],
    },
    "clinic": {
        "hero_text": "Care you can trust, close to home.",
        "image": "photo-1519494026892-80bbd2d6fd0d",
        "map_coordinates": {"latitude": 13.0827, "longitude": 80.2707},
        "products": [
            {"name": "General Consultation", "price": 500.0, "category": "Appointments"},
            {"name": "Dental Check-up", "price": 800.0, "category": "Appointments"},
            {"name": "Wellness Follow-up", "price": 350.0, "category": "Appointments"},
        ],
    },
    "default": {
        "hero_text": "A better digital experience for your business.",
        "image": "photo-1497366754035-f200968a6e72",
        "map_coordinates": {"latitude": 19.076, "longitude": 72.8777},
        "products": [
            {"name": "Starter Package", "price": 999.0, "category": "Featured"},
            {"name": "Popular Package", "price": 1999.0, "category": "Featured"},
            {"name": "Premium Package", "price": 3499.0, "category": "Featured"},
        ],
    },
}

IMAGE_URL_BASE = "https://images.unsplash.com/"


def category_fallback_assets(
    category: str,
    preferences: dict[str, Any] | None = None,
) -> dict[str, Any]:
    preferences = preferences or {}
    normalized = category.casefold().strip()
    defaults = CATEGORY_ASSETS.get(normalized, CATEGORY_ASSETS["default"])

    photos = preferences.get("photos") or [
        f"{IMAGE_URL_BASE}{defaults['image']}?auto=format&fit=crop&w=1600&q=80"
    ]
    content = preferences.get("content") or {}
    hero_text = content.get("hero_text") or defaults["hero_text"]
    products = preferences.get("sample_products") or defaults["products"]
    coordinates = preferences.get("map_coordinates") or defaults["map_coordinates"]

    return {
        "hero_text": hero_text,
        "images": photos,
        "sample_products": products,
        "map_coordinates": coordinates,
        "placeholders": {
            "hero_text": not bool(content.get("hero_text")),
            "images": not bool(preferences.get("photos")),
            "sample_products": not bool(preferences.get("sample_products")),
            "map_coordinates": not bool(preferences.get("map_coordinates")),
        },
        "is_placeholder": not all(
            (
                bool(content.get("hero_text")),
                bool(preferences.get("photos")),
                bool(preferences.get("sample_products")),
                bool(preferences.get("map_coordinates")),
            )
        ),
    }


def developer_starter_kit(category: str, preferences: dict[str, Any] | None = None) -> dict[str, Any]:
    preferences = preferences or {}
    assets = preferences.get("asset_fallback") or category_fallback_assets(category, preferences)
    return {
        "sample_products": {
            "is_placeholder": assets["placeholders"]["sample_products"],
            "products": assets["sample_products"],
        },
        "mock_content": {
            "is_placeholder": assets["is_placeholder"],
            "hero_text": assets["hero_text"],
            "images": assets["images"],
            "map_coordinates": assets["map_coordinates"],
            "placeholders": assets["placeholders"],
        },
    }
