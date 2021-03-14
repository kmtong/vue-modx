import { calculateStartupSeq } from '../src/index';

test('Module Loading Sequence', () => {

  // empty test
  expect(calculateStartupSeq([])).toStrictEqual([]);

  // simple dependency check
  expect(calculateStartupSeq([
    { name: "b", dependsOn: ["a"] },
    { name: "a" }
  ])).toStrictEqual([
    { name: "a" },
    { name: "b", dependsOn: ["a"] }
  ]);

  // more dependency check
  expect(calculateStartupSeq([
    { name: "c", dependsOn: ["a", "b"] },
    { name: "b", dependsOn: ["a"] },
    { name: "a" }
  ])).toStrictEqual([
    { name: "a" },
    { name: "b", dependsOn: ["a"] },
    { name: "c", dependsOn: ["a", "b"] }
  ]);

  // fail dependencies
  expect(() => calculateStartupSeq([
    { name: "b", dependsOn: ["a"] },
    { name: "a", dependsOn: ["x"] }
  ])).toThrowError("Unresolved Dependencies for a (missing: x)")

  // fail dependencies
  expect(() => calculateStartupSeq([
    { name: "c", dependsOn: ["b", "x"] },
    { name: "b", dependsOn: ["a"] },
    { name: "a", dependsOn: ["x"] }
  ])).toThrowError("Unresolved Dependencies for c,a (missing: x)")

  // fail dependencies
  expect(() => calculateStartupSeq([
    { name: "c", dependsOn: ["a", "b"] },
    { name: "b" }
  ])).toThrowError("Unresolved Dependencies for c (missing: a)")

});


test('Extension Tests', async () => {

  // extend by static and function result
  expect(await (async () => {
    const Vue = await import('vue')
    const VueModx = await import('../src/index')

    let extObj = [];
    const Mod1 = {
      name: "module1",
      moduleSpaceVar: "Module Space Variable",
      extensionPoints: {
        testStatic(reg, obj) {
          extObj.push(obj);
        },
        testFunc(reg, obj) {
          extObj.push(obj);
        },
        testWithModx(reg, obj) {
          extObj.push(obj);
        }
      },
      extensions: {
        testStatic: {
          "Hello": "World"
        },
        testFunc() {
          return {
            "Hello": "Functional World"
          };
        },
        testWithModx({ vueModx }) {
          const fromModule = vueModx.moduleByName("module1").moduleSpaceVar;
          return {
            "ModuleDep": fromModule
          }
        }
      }
    };
    Vue.default.use(VueModx.default, {
      modules: [Mod1]
    });
    return extObj;
  })()).toStrictEqual([{ "Hello": "World" }, { "Hello": "Functional World" }, { "ModuleDep": "Module Space Variable" }]);


});

test('Embedded Module Tests', async () => {

  const Mod2 = {
    name: "module2"
  };
  const Mod3 = {
    name: "module3",
    dependsOn: [Mod2]
  }
  const Mod1 = {
    name: "module1",
    dependsOn: ['module2', Mod3]
  };

  expect(calculateStartupSeq([
    Mod1, Mod2
  ])).toStrictEqual([
    { name: "module2" },
    { name: "module3", dependsOn: ["module2"] },
    { name: "module1", dependsOn: ["module2", "module3"] }
  ]);

})