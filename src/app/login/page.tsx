import { LogIn } from "lucide-react";
import { loginTeacher } from "@/app/actions";

export default function LoginPage() {
  return (
    <div className="login-screen">
      <section className="panel login-panel">
        <div className="page-header">
          <div>
            <h1 className="page-title">教师登录</h1>
            <p className="page-kicker">单教师本地试用版</p>
          </div>
        </div>
        <form action={loginTeacher} className="form-grid">
          <div className="field">
            <label htmlFor="name">教师姓名</label>
            <input className="input" id="name" name="name" defaultValue="示例教师" />
          </div>
          <div className="field">
            <label htmlFor="phone">登录标识</label>
            <input className="input" id="phone" name="phone" defaultValue="demo" />
          </div>
          <button className="button" type="submit">
            <LogIn size={18} />
            进入工作台
          </button>
        </form>
      </section>
    </div>
  );
}
