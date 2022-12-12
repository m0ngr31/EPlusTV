import {execSync} from 'child_process';
import kill from 'tree-kill';

/** Alpine doesn't support killing a child processes since it doesn't handle the ps command normally. This is a failsafe */
export const killChildren = (pid: number): void => {
  const children = [];

  try {
    const psRes = execSync(`ps -opid="" -oppid="" |grep ${pid}`)
      .toString()
      .trim()
      .split(/\n/);

    (psRes || []).forEach(pidGroup => {
      const [actual, parent] = pidGroup.trim().split(/ +/);

      if (parent.toString() === pid.toString()) {
        children.push(parseInt(actual, 10));
      }
    });
  } catch (e) {}

  try {
    kill(pid);
    children.forEach(childPid => kill(childPid));
  } catch (e) {}
};
