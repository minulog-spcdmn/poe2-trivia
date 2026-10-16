<script lang="ts">
  import { ALL_CIRCLES } from './circles';

  // For now, while the circles find their places: any of the five, drawn
  // at random each time one is put up.
  let props: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();
  const Circle = ALL_CIRCLES[Math.floor(Math.random() * ALL_CIRCLES.length)];
</script>

<Circle {...props} />
