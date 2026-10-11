export default function Header({ withNav = false }) {
  return (
    <header>
      <h1>ShopEasy</h1>
      {withNav && <nav><a href="#help">Help</a></nav>}
    </header>
  );
}
