export default function Alert({ children, className }) {
  return children ? <div role="alert" className={className}>{children}</div> : null;
}
