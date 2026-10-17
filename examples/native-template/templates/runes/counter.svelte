<script>
  import CounterLabel from "./counter-label.svelte";
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>

<button type="button" onclick={() => count++}>
  <CounterLabel count={count} doubled={doubled} />
</button>
