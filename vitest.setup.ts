import '@testing-library/jest-dom/vitest';
import 'vitest-canvas-mock';
import 'fake-indexeddb/auto';
import { configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 3000 });
