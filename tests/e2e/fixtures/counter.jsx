import React, { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Counter</h1>
      <button id="inc" onClick={() => setCount(count + 1)}>Clicked {count} times</button>
    </div>
  );
}
