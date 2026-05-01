let cart = JSON.parse(localStorage.getItem("cart")) || [];

/* ---------------- TOAST ---------------- */
function showToast() {
  const toast = document.createElement("div");
  toast.className = "cart-toast";
  toast.innerText = "Added to cart";
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2000);
}

/* ---------------- CART COUNT ---------------- */
function updateCartCount() {
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

  document.querySelectorAll(".cart-count").forEach(el => {
    el.textContent = totalQuantity;
  });
}

/* ---------------- RENDER CART ---------------- */
function renderCart() {
  const container = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");

  if (!container || !totalEl) return;

  container.innerHTML = "";
  let total = 0;

  cart.forEach((item, index) => {
    const itemTotal = parseFloat(item.price) * item.quantity;
    total += itemTotal;

    container.innerHTML += `
      <div class="cart-item">
        <div class="cart-info">
          <strong>${item.name}</strong><br>
          $${item.price} x ${item.quantity}
        </div>

        <div class="cart-controls">
          <button onclick="decreaseQty(${index})">−</button>
          <button onclick="increaseQty(${index})">+</button>
          <button onclick="removeItem(${index})">Remove</button>
        </div>

        <div class="cart-line-total">
          $${itemTotal.toFixed(2)}
        </div>
      </div>
    `;
  });

  totalEl.textContent = total.toFixed(2);
}

/* ---------------- ADD TO CART ---------------- */
document.addEventListener("click", function(e) {
  if (e.target.classList.contains("add-to-cart-btn")) {
    const name = e.target.dataset.name;
    const price = e.target.dataset.price;

    const existingItem = cart.find(item => item.name === name);

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({ name, price, quantity: 1 });
    }

    localStorage.setItem("cart", JSON.stringify(cart));

    updateCartCount();
    showToast();
    renderCart();
  }
});

/* ---------------- QUANTITY CONTROLS ---------------- */
function increaseQty(index) {
  cart[index].quantity += 1;

  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
  renderCart();
}

function decreaseQty(index) {
  if (cart[index].quantity > 1) {
    cart[index].quantity -= 1;
  } else {
    cart.splice(index, 1);
  }

  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
  renderCart();
}

function removeItem(index) {
  cart.splice(index, 1);

  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
  renderCart();
}

/* ---------------- CHECKOUT ---------------- */
const checkoutForm = document.getElementById("checkout-form");

if (checkoutForm) {
  checkoutForm.addEventListener("submit", function(e) {
    e.preventDefault();

    localStorage.removeItem("cart");
    cart = [];

    updateCartCount();
    renderCart();

    window.location.href = "thank-you.html";
  });
}

/* ---------------- INIT ---------------- */
updateCartCount();
renderCart();