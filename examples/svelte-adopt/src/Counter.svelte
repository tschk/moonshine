<script>
  let { start = 0 } = $props();
  let count = $state(start);
</script>

<div class="counter">
  <h1>moonshine hosts svelte</h1>
  <p>count is {count}</p>
  <button onclick={() => count++}>increment</button>
</div>
