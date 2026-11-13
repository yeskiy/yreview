package com.yeskiy.yreview.session

import com.intellij.terminal.frontend.view.TerminalView
import java.lang.reflect.Proxy

/**
 * A terminal view that answers the getters in [answers], keyed by the JVM method name.
 * Every other member throws, so the fake does not depend on the full member list of a release.
 */
internal fun fakeTerminalView(answers: Map<String, Any>, reason: String): TerminalView =
    Proxy.newProxyInstance(TerminalView::class.java.classLoader, arrayOf(TerminalView::class.java)) { proxy, method, args ->
        when (method.name) {
            in answers -> answers.getValue(method.name)
            "toString" -> "TerminalView($reason)"
            "hashCode" -> System.identityHashCode(proxy)
            "equals" -> proxy === args?.firstOrNull()
            else -> throw NotImplementedError("$reason The test called ${method.name}.")
        }
    } as TerminalView
