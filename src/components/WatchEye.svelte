<!-- The spectators' sign: an engraved eye, the lids two circular arcs with a
     crease over the upper one, the iris a ring round a small pupil. -->
<svg class="eye" viewBox="0 0 24 24" aria-hidden="true"
  ><path d="M2.5 12A11.6 11.6 0 0 1 21.5 12A11.6 11.6 0 0 1 2.5 12Z" /><path d="M5 8.2A10.15 10.15 0 0 1 19 8.2" /><circle
    cx="12"
    cy="12"
    r="3.3"
  /><circle class="pupil" cx="12" cy="12" r="1.25" /></svg
>

<style>
  .eye {
    flex: none;
    display: block;
    width: var(--eye-size, 16px);
    height: var(--eye-size, 16px);
    fill: none;
    stroke: currentColor;
    stroke-width: 1px;
    stroke-linecap: round;
  }
  path,
  circle {
    vector-effect: non-scaling-stroke;
  }
  .pupil {
    fill: currentColor;
    stroke: none;
  }
</style>
