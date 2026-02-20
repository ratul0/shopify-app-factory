# Extension Templates

Scaffolds for Shopify theme, checkout, admin, and POS extensions.

## Theme App Extension (Product Page Block)

The most common extension type. Adds a block to the product page that merchants can position in the theme editor.

### Directory Structure

```
extensions/[ext-name]/
├── blocks/
│   └── [block-name].liquid
├── assets/
│   ├── [app-name].js
│   └── [app-name].css
└── shopify.extension.toml
```

### Extension Config

```toml
# extensions/[ext-name]/shopify.extension.toml
api_version = "2025-04"
type = "theme"

[[extensions]]
name = "Extension Display Name"
handle = "ext-handle"

  [[extensions.targeting]]
  module = "./blocks/block-name.liquid"
  target = "section"
```

### Liquid Block Template

```liquid
{%- comment -%}
  extensions/[ext-name]/blocks/[block-name].liquid
  Theme App Extension block for product pages.
{%- endcomment -%}

{% schema %}
{
  "name": "App Block Name",
  "target": "section",
  "javascript": "app-name.js",
  "stylesheet": "app-name.css",
  "enabled_on": {
    "templates": ["product"]
  },
  "settings": [
    {
      "type": "text",
      "id": "button_text",
      "label": "Button Text",
      "default": "Click Me"
    },
    {
      "type": "color",
      "id": "primary_color",
      "label": "Primary Color",
      "default": "#000000"
    },
    {
      "type": "range",
      "id": "border_radius",
      "label": "Border Radius",
      "min": 0,
      "max": 20,
      "step": 2,
      "default": 8,
      "unit": "px"
    },
    {
      "type": "checkbox",
      "id": "show_icon",
      "label": "Show Icon",
      "default": true
    }
  ]
}
{% endschema %}

<div id="app-root"
  data-product-id="{{ product.id }}"
  data-product-handle="{{ product.handle }}"
  data-product-title="{{ product.title | escape }}"
  data-product-image="{{ product.featured_image | image_url: width: 800 }}"
  data-shop-url="{{ shop.url }}"
  data-variant-id="{{ product.selected_or_first_available_variant.id }}"
  style="width: 100%; margin: 0.5rem 0;">

  <button id="app-action-btn"
    class="app-btn"
    style="
      background-color: {{ block.settings.primary_color }};
      width: 100%;
      padding: 0.875rem 2rem;
      font-size: 1rem;
      font-weight: 600;
      border: none;
      border-radius: {{ block.settings.border_radius }}px;
      cursor: pointer;
      color: #ffffff;
    ">
    {{ block.settings.button_text }}
  </button>
</div>
```

### JavaScript Pattern (Vanilla JS)

```javascript
// extensions/[ext-name]/assets/app-name.js

(function() {
  'use strict';

  const root = document.getElementById('app-root');
  if (!root) return;

  // Read data attributes
  const config = {
    productId: root.dataset.productId,
    productHandle: root.dataset.productHandle,
    productTitle: root.dataset.productTitle,
    productImage: root.dataset.productImage,
    shopUrl: root.dataset.shopUrl,
    variantId: root.dataset.variantId,
  };

  // App proxy base URL
  const proxyBase = `${config.shopUrl}/apps/SUBPATH`;

  const actionBtn = document.getElementById('app-action-btn');

  // --- Check if feature is enabled for this product ---
  async function checkEnabled() {
    try {
      const response = await fetch(
        `${proxyBase}/check?productId=${config.productId}`
      );
      const data = await response.json();

      if (!data.enabled) {
        root.style.display = 'none';
      }
    } catch (error) {
      console.error('Failed to check product status:', error);
      root.style.display = 'none';
    }
  }

  // --- Handle button click ---
  async function handleAction() {
    actionBtn.disabled = true;
    actionBtn.textContent = 'Processing...';

    try {
      const response = await fetch(`${proxyBase}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: config.productId,
          variantId: config.variantId,
        }),
      });

      const data = await response.json();

      if (data.jobId) {
        // Poll for async result
        pollStatus(data.jobId);
      } else if (data.result) {
        // Sync result
        showResult(data.result);
      } else {
        showError(data.error || 'Something went wrong');
      }
    } catch (error) {
      showError('Network error. Please try again.');
    }
  }

  // --- Poll for async job status ---
  async function pollStatus(jobId) {
    const maxAttempts = 60;
    let attempts = 0;

    const poll = setInterval(async () => {
      attempts++;

      if (attempts > maxAttempts) {
        clearInterval(poll);
        showError('Request timed out. Please try again.');
        return;
      }

      try {
        const response = await fetch(`${proxyBase}/status?jobId=${jobId}`);
        const data = await response.json();

        if (data.status === 'completed') {
          clearInterval(poll);
          showResult(data.result);
        } else if (data.status === 'failed') {
          clearInterval(poll);
          showError(data.error || 'Processing failed');
        }
        // pending/processing — keep polling
      } catch (error) {
        clearInterval(poll);
        showError('Network error');
      }
    }, 2000); // Poll every 2 seconds
  }

  // --- Display result ---
  function showResult(result) {
    actionBtn.disabled = false;
    actionBtn.textContent = 'Done!';
    // Customize result display for your app
  }

  // --- Display error ---
  function showError(message) {
    actionBtn.disabled = false;
    actionBtn.textContent = 'Try Again';
    console.error('App error:', message);
  }

  // --- Initialize ---
  actionBtn.addEventListener('click', handleAction);
  checkEnabled();
})();
```

### CSS Pattern

```css
/* extensions/[ext-name]/assets/app-name.css */

.app-btn {
  transition: opacity 0.2s ease;
  font-family: inherit;
  line-height: 1.4;
}

.app-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.app-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

## Checkout UI Extension

For adding custom UI in the checkout flow. Uses Shopify's Checkout UI Extensions API.

### Setup

```bash
shopify app generate extension --type checkout_ui
```

### Extension Config

```toml
# extensions/checkout-ext/shopify.extension.toml
api_version = "2025-04"
type = "checkout_ui"

[[extensions]]
name = "Checkout Extension"
handle = "checkout-ext"

  [[extensions.targeting]]
  module = "./src/Checkout.tsx"
  target = "purchase.checkout.block.render"
```

### Component (React)

```tsx
// extensions/checkout-ext/src/Checkout.tsx
import {
  Banner,
  BlockStack,
  Text,
  useApi,
  reactExtension,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension(
  "purchase.checkout.block.render",
  () => <Extension />,
);

function Extension() {
  const { extension } = useApi();

  return (
    <BlockStack spacing="loose">
      <Banner title="Custom Message">
        <Text>Your custom checkout content here.</Text>
      </Banner>
    </BlockStack>
  );
}
```

**Important:** Checkout extensions use React Shopify UI components (NOT Polaris Web Components). These are validated with `validate_component_codeblocks(api: "polaris-checkout-extensions")`.

## Admin Action Extension

For adding custom actions in the Shopify admin.

### Setup

```bash
shopify app generate extension --type admin_action
```

### Extension Config

```toml
# extensions/admin-action/shopify.extension.toml
api_version = "2025-04"
type = "admin_action"

[[extensions]]
name = "Admin Action"
handle = "admin-action"

  [[extensions.targeting]]
  module = "./src/ActionExtension.tsx"
  target = "admin.product-details.action.render"
```

### Component

```tsx
// extensions/admin-action/src/ActionExtension.tsx
import { useEffect, useState } from "react";
import {
  AdminAction,
  BlockStack,
  Text,
  Button,
  reactExtension,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.product-details.action.render";

export default reactExtension(TARGET, () => <App />);

function App() {
  return (
    <AdminAction
      title="My Action"
      primaryAction={<Button onPress={() => console.log("Action!")}>Execute</Button>}
      secondaryAction={<Button onPress={() => console.log("Cancel")}>Cancel</Button>}
    >
      <BlockStack>
        <Text>Configure your action here.</Text>
      </BlockStack>
    </AdminAction>
  );
}
```

## App Embed Block

For app-wide functionality that doesn't appear as a visible block (analytics, chat widgets, etc.).

### Liquid

```liquid
{% schema %}
{
  "name": "App Embed",
  "target": "body",
  "settings": [
    {
      "type": "checkbox",
      "id": "enabled",
      "label": "Enable",
      "default": true
    }
  ]
}
{% endschema %}

{% if block.settings.enabled %}
  <script src="{{ 'app-embed.js' | asset_url }}" defer></script>
{% endif %}
```

## Extension Development Tips

1. **Test with `shopify app dev`** — Extensions hot-reload in the theme editor
2. **Use data attributes** — Pass Liquid variables to JavaScript via `data-*` attributes
3. **Vanilla JS only** — Theme extensions can't use React or build tools
4. **Checkout/Admin extensions use React** — These have their own component libraries
5. **Validate Liquid** — Use `validate_theme` MCP tool
6. **Validate Checkout/Admin components** — Use `validate_component_codeblocks` MCP tool
7. **App proxy for API calls** — Extensions communicate with your app via `shop.url + /apps/subpath/`
