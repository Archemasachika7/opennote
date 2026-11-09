import { render, screen, renderHook, act } from '@testing-library/react';
import { App, useRoute } from '../../src/App';

describe('App shell', () => {
  it('renders the library at #/', () => {
    window.location.hash = '#/';
    render(<App />);
    expect(screen.getByRole('heading', { name: 'OpenNote' })).toBeInTheDocument();
  });

  it('parses notebook routes', () => {
    window.location.hash = '#/nb/abc';
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ name: 'notebook', id: 'abc' });
  });

  it('updates route on hashchange', () => {
    window.location.hash = '#/';
    const { result } = renderHook(() => useRoute());
    act(() => {
      window.location.hash = '#/nb/xyz';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toEqual({ name: 'notebook', id: 'xyz' });
  });
});
